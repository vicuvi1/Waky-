import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import pc_alarm  # noqa: E402
import server  # noqa: E402
import stats  # noqa: E402
from server import App, BadRequest  # noqa: E402
from store import DEFAULT_SETTINGS, Store  # noqa: E402

TODAY = date(2026, 10, 22)


class FakeRinger:
    def __init__(self, *_):
        self.ringing = False
        self.chimes = 0

    def start(self, max_minutes=20, sound="sunrise", ramp_seconds=60):
        self.ringing = True
        self.last = {"max": max_minutes, "sound": sound, "ramp": ramp_seconds}

    def stop(self, generation=None):
        self.ringing = False

    def chime(self):
        self.chimes += 1


def rec(time="06:30", **extra):
    return {"time": time, "target": "06:30", "reps": 0, "mode": "button", **extra}


class StillUpRulesTest(unittest.TestCase):
    def test_states(self):
        r = rec(stillUpDue="06:50")
        state = lambda now: stats.still_up_state(r, TODAY, TODAY, stats.to_minutes(now))
        self.assertEqual(state("06:49"), "waiting")
        self.assertEqual(state("06:50"), "open")
        self.assertEqual(state("07:00"), "open")
        self.assertEqual(state("07:01"), "missed")
        self.assertEqual(stats.still_up_state(r, TODAY - timedelta(days=1), TODAY, None), "missed")
        self.assertEqual(stats.still_up_state({**r, "stillUp": "06:52"}, TODAY, TODAY, 0), "done")
        self.assertEqual(stats.still_up_state(rec(), TODAY, TODAY, 0), "none")  # Days from before the check existed.

    def test_coins(self):
        def coins(r, now="08:00"):
            data = {"settings": dict(DEFAULT_SETTINGS), "days": {TODAY.isoformat(): r}}
            return stats.compute(data, TODAY, stats.to_minutes(now))["today"]["coins"]
        self.assertEqual(coins(rec(stillUpDue="06:50", stillUp="06:51")), 15)  # 10 + 5
        self.assertEqual(coins(rec(stillUpDue="06:50")), 5)  # missed: half of 10
        self.assertEqual(coins(rec(stillUpDue="06:50"), now="06:55"), 10)  # still open: full for now
        self.assertEqual(coins(rec()), 10)  # no check that day


class AppAlarmTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = (pc_alarm.set_volume, server.pc_alarm.Ringer)
        pc_alarm.set_volume = lambda *a: None  # Never press the real volume keys in tests.
        server.pc_alarm.Ringer = FakeRinger
        self.app = App(Store(self.tmp.name), background=False)

    def tearDown(self):
        pc_alarm.set_volume, server.pc_alarm.Ringer = self.old
        self.tmp.cleanup()

    def test_alarm_rings_until_check_in(self):
        s = self.app.start_alarm()
        self.assertTrue(s["alarm"]["active"] and self.app.ringer.ringing)
        with self.assertRaises(BadRequest):
            self.app.alarm_action({"action": "stop"})  # The real alarm can't just be switched off.
        s = self.app.checkin({})
        self.assertFalse(s["alarm"]["active"] or self.app.ringer.ringing)

    def test_no_alarm_when_already_up(self):
        self.app.checkin({})
        self.assertFalse(self.app.start_alarm()["alarm"]["active"])

    def test_test_alarm_can_be_stopped(self):
        self.app.alarm_action({"action": "test"})
        self.assertTrue(self.app.alarm["test"])
        self.assertFalse(self.app.alarm_action({"action": "stop"})["alarm"]["active"])

    def test_check_in_schedules_the_still_up_check(self):
        s = self.app.checkin({})
        r = s["days"][date.today().isoformat()]
        due = datetime.strptime(r["stillUpDue"], "%H:%M")
        now = datetime.now()
        self.assertAlmostEqual((due.hour * 60 + due.minute) - (now.hour * 60 + now.minute), 20, delta=1)
        with self.assertRaises(BadRequest):
            self.app.still_up({})  # Not open yet

    def test_answering_the_still_up_check(self):
        self.app.checkin({})
        data = self.app.store.load()
        data["days"][date.today().isoformat()]["stillUpDue"] = (datetime.now() - timedelta(minutes=1)).strftime("%H:%M")
        self.app.store.save(data)
        self.app.still_up_tick()
        self.assertEqual(self.app.ringer.chimes, 1)
        self.app.still_up_tick()
        self.assertEqual(self.app.ringer.chimes, 1)  # Only once
        s = self.app.still_up({})
        self.assertEqual(s["stats"]["today"]["stillUp"]["state"], "done")

    def test_alarm_uses_your_settings(self):
        volumes = []
        server.pc_alarm.set_volume = volumes.append
        self.app.update_settings({"alarmSound": "beeps", "alarmRamp": 90, "alarmMax": 5, "alarmVolume": 60})
        self.app.start_alarm()
        self.assertEqual(self.app.ringer.last, {"max": 5, "sound": "beeps", "ramp": 90})
        import time
        time.sleep(0.1)  # The volume is set in a background thread.
        self.assertEqual(volumes, [60])

    def test_settings_are_clamped(self):
        s = self.app.update_settings({"alarmOffset": -99, "alarmVolume": 500, "stillUpAfter": 1,
                                      "alarmSound": "air-horn"})["settings"]
        self.assertEqual((s["alarmOffset"], s["alarmVolume"], s["stillUpAfter"], s["alarmSound"]), (-15, 100, 5, "sunrise"))

    def test_still_up_timing_is_saved_per_day(self):
        self.app.update_settings({"stillUpAfter": 30, "stillUpWindow": 5})
        s = self.app.checkin({})
        r = s["days"][date.today().isoformat()]
        self.assertEqual(r["stillUpWindow"], 5)
        due = datetime.strptime(r["stillUpDue"], "%H:%M")
        now = datetime.now()
        self.assertAlmostEqual((due.hour * 60 + due.minute) - (now.hour * 60 + now.minute), 30, delta=1)
        # Changing the window later doesn't change that day's deadline.
        self.app.update_settings({"stillUpWindow": 20})
        self.assertEqual(self.app.state()["stats"]["today"]["stillUp"]["deadline"],
                         stats.from_minutes(stats.to_minutes(r["stillUpDue"]) + 5))

    def test_still_up_can_be_turned_off(self):
        self.app.update_settings({"stillUp": False})
        s = self.app.checkin({})
        self.assertNotIn("stillUpDue", s["days"][date.today().isoformat()])


class TaskTest(unittest.TestCase):
    def test_task_wakes_the_pc_a_minute_early(self):
        xml = pc_alarm.task_xml("06:30", "07:00", vbs=Path("C:/Waky/launch/Waky.vbs"))
        self.assertIn("<WakeToRun>true</WakeToRun>", xml)
        self.assertIn("T06:29:00", xml)
        self.assertIn("T06:59:00", xml)
        self.assertIn("<Monday />", xml)
        self.assertIn("<Sunday />", xml)
        self.assertIn("--alarm", xml)
        self.assertEqual(pc_alarm.alarm_time("00:00"), "23:59")
        self.assertEqual(pc_alarm.alarm_time("06:30", 5), "06:35")
        self.assertIn("T06:20:00", pc_alarm.task_xml("06:30", "07:00", offset=-10))

    def test_every_sound_renders(self):
        for name in pc_alarm.SOUNDS:
            frames = pc_alarm._chime(0.5, lambda t: 1.0, name)
            self.assertEqual(len(frames), int(0.5 * pc_alarm.RATE) * 2)
            self.assertTrue(any(frames))


if __name__ == "__main__":
    unittest.main()

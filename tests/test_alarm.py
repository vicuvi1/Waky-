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

    def start(self, max_minutes=20):
        self.ringing = True

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
        self.old = (pc_alarm.volume_up, server.pc_alarm.Ringer)
        pc_alarm.volume_up = lambda *a: None  # Never press the real volume keys in tests.
        server.pc_alarm.Ringer = FakeRinger
        self.app = App(Store(self.tmp.name), background=False)

    def tearDown(self):
        pc_alarm.volume_up, server.pc_alarm.Ringer = self.old
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


if __name__ == "__main__":
    unittest.main()

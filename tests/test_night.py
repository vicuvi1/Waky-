import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import night  # noqa: E402
import server  # noqa: E402
import stats  # noqa: E402
from server import App  # noqa: E402
from store import DEFAULT_SETTINGS, Store  # noqa: E402

SETTINGS = {**DEFAULT_SETTINGS, "weekday": "06:30", "weekend": "08:00", "sleepGoal": 480, "bedRemind": 30, "grace": 15}


def at(text):
    return datetime.strptime(text, "%Y-%m-%d %H:%M")


class NightRulesTest(unittest.TestCase):
    def test_a_night_belongs_to_the_next_morning(self):
        self.assertEqual(night.morning_for(at("2026-10-25 23:10")), date(2026, 10, 26))
        self.assertEqual(night.morning_for(at("2026-10-26 00:30")), date(2026, 10, 26))

    def test_bedtime_is_wake_minus_goal(self):
        self.assertEqual(night.bedtime_for("06:30", SETTINGS), "22:30")
        self.assertEqual(night.bedtime_for("08:00", SETTINGS), "00:00")
        self.assertEqual(night.bedtime_for("06:30", {**SETTINGS, "sleepGoal": 450}), "23:00")

    def test_on_time_across_midnight(self):
        self.assertTrue(night.on_time({"time": "22:40", "target": "22:30"}, 15))
        self.assertFalse(night.on_time({"time": "22:50", "target": "22:30"}, 15))
        self.assertTrue(night.on_time({"time": "23:55", "target": "00:00"}, 15))
        self.assertFalse(night.on_time({"time": "00:30", "target": "00:00"}, 15))

    def test_sleep_hours(self):
        self.assertEqual(night.sleep_minutes({"time": "22:45"}, {"time": "06:32"}), 467)
        self.assertEqual(night.sleep_minutes({"time": "00:10"}, {"time": "06:40"}), 390)
        self.assertIsNone(night.sleep_minutes({"time": "06:00"}, {"time": "06:32"}))  # 32 min: a mistake
        self.assertIsNone(night.sleep_minutes(None, {"time": "06:32"}))

    def test_evening_states(self):
        def state(when):
            return night.tonight(at(when), SETTINGS, stats.target_for, {}, {})["state"]
        # 2026-10-22 is a Thursday: Friday's wake-up is 06:30, so bedtime 22:30.
        self.assertEqual(state("2026-10-22 15:00"), "day")
        self.assertEqual(state("2026-10-22 20:00"), "evening")
        self.assertEqual(state("2026-10-22 22:05"), "remind")
        self.assertEqual(state("2026-10-22 22:35"), "due")
        self.assertEqual(state("2026-10-22 23:30"), "late")
        self.assertEqual(state("2026-10-23 02:00"), "late")
        self.assertEqual(state("2026-10-23 07:00"), "day")
        # Friday night leads to a weekend morning (08:00), so bedtime is midnight.
        t = night.tonight(at("2026-10-23 21:00"), SETTINGS, stats.target_for, {}, {})
        self.assertEqual((t["bedtime"], t["wake"], t["state"]), ("00:00", "08:00", "evening"))

    def test_coins_and_sleep_in_stats(self):
        today = date(2026, 10, 22)
        data = {"settings": SETTINGS, "telegram": {},
                "days": {today.isoformat(): {"time": "06:31", "target": "06:30", "reps": 0, "mode": "button"}},
                "nights": {today.isoformat(): {"time": "22:40", "target": "22:30"},
                           (today - timedelta(days=1)).isoformat(): {"time": "23:30", "target": "22:30"}}}
        s = stats.compute(data, today, 8 * 60)
        self.assertEqual(s["coins"]["earned"], 10 + 5)  # Morning on time + one bedtime on time
        self.assertEqual(s["sleep"]["last"], 471)
        self.assertEqual(s["sleep"]["nights"], 1)


class GoingToBedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = App(Store(self.tmp.name), background=False)

    def tearDown(self):
        self.tmp.cleanup()

    def test_going_to_bed_once_and_undo(self):
        first = self.app.going_to_bed({})
        key = night.morning_for(datetime.now()).isoformat()
        self.assertIn(key, first["stats"]["night"]["record"] and self.app.store.load()["nights"])
        again = self.app.going_to_bed({})
        self.assertEqual(first["stats"]["night"]["record"], again["stats"]["night"]["record"])
        self.app.undo_bed()
        self.assertNotIn(key, self.app.store.load()["nights"])

    def test_reminders_are_sent_once_per_night(self):
        chimes = []
        self.app.ringer.chime = lambda: chimes.append(1)
        clock = {"now": datetime.combine(date.today(), datetime.min.time()).replace(hour=22, minute=5)}

        class FakeDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return clock["now"]

        real, server.datetime = server.datetime, FakeDatetime
        try:
            self.app.bed_tick()  # 22:05: reminder (bedtime 22:30)
            self.app.bed_tick()  # again: nothing new
            clock["now"] = clock["now"].replace(minute=35)
            self.app.bed_tick()  # 22:35: bedtime nudge
            self.app.bed_tick()
        finally:
            server.datetime = real
        self.assertEqual(len(chimes), 2)


if __name__ == "__main__":
    unittest.main()

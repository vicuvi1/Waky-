import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import stats  # noqa: E402
from server import App, BadRequest, checkin_text  # noqa: E402
from store import DEFAULT_SETTINGS, Store  # noqa: E402

TODAY = date(2026, 10, 22)  # A Thursday
SETTINGS = {**DEFAULT_SETTINGS}


def day(offset, time="06:30", target="06:30"):
    return (TODAY - timedelta(days=offset)).isoformat(), {"time": time, "target": target, "reps": 20, "mode": "camera"}


def data(*records):
    return {"settings": SETTINGS, "days": dict(records), "telegram": {}}


class StreakTest(unittest.TestCase):
    def test_counts_consecutive_on_time_days(self):
        s = stats.compute(data(day(0), day(1), day(2)), TODAY)
        self.assertEqual(s["streak"], 3)

    def test_today_not_done_yet_keeps_yesterdays_streak(self):
        s = stats.compute(data(day(1), day(2)), TODAY)
        self.assertEqual(s["streak"], 2)

    def test_missed_day_breaks_streak(self):
        s = stats.compute(data(day(0), day(2), day(3)), TODAY)
        self.assertEqual(s["streak"], 1)
        self.assertEqual(s["best"], 2)

    def test_late_today_breaks_streak(self):
        s = stats.compute(data(day(0, "07:10"), day(1), day(2)), TODAY)
        self.assertEqual(s["streak"], 0)
        self.assertEqual(s["best"], 2)

    def test_grace_window_counts_as_on_time(self):
        s = stats.compute(data(day(0, "06:45"), day(1, "06:46")), TODAY)
        self.assertEqual(s["streak"], 1)


class NumbersTest(unittest.TestCase):
    def test_average_and_rate(self):
        s = stats.compute(data(day(0, "06:20"), day(1, "06:40"), day(3, "07:30")), TODAY)
        self.assertEqual(s["avg"], "06:50")
        # 4 days since the first check-in (today counts because it's done), 2 on time.
        self.assertEqual(s["rate"], 50)

    def test_empty(self):
        s = stats.compute(data(), TODAY)
        self.assertEqual((s["streak"], s["best"], s["rate"], s["avg"]), (0, 0, None, None))
        self.assertEqual(s["next"]["days"], 1)

    def test_calendar_is_five_weeks_ending_sunday(self):
        s = stats.compute(data(day(1)), TODAY)
        cal = s["calendar"]
        self.assertEqual(len(cal), 35)
        self.assertEqual(date.fromisoformat(cal[-1]["date"]).weekday(), 6)
        by_date = {c["date"]: c["status"] for c in cal}
        self.assertEqual(by_date[TODAY.isoformat()], "pending")
        self.assertEqual(by_date[(TODAY - timedelta(days=1)).isoformat()], "ontime")
        self.assertEqual(by_date[(TODAY - timedelta(days=2)).isoformat()], "empty")
        self.assertEqual(by_date[(TODAY + timedelta(days=1)).isoformat()], "future")

    def test_milestones(self):
        recs = [day(i) for i in range(7)]
        s = stats.compute(data(*recs), TODAY)
        self.assertEqual(s["hit"]["days"], 7)
        self.assertEqual(s["next"]["days"], 14)
        self.assertEqual(s["next"]["from"], 7)
        self.assertTrue(all(m["reached"] for m in s["milestones"] if m["days"] <= 7))

    def test_weekend_target(self):
        self.assertEqual(stats.target_for(date(2026, 10, 24), SETTINGS), "07:00")
        self.assertEqual(stats.target_for(date(2026, 10, 23), SETTINGS), "06:30")


class AppTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = App(Store(self.tmp.name, Path(self.tmp.name) / "backup"), background=False)

    def tearDown(self):
        self.tmp.cleanup()

    def test_checkin_once_per_day_and_backup(self):
        first = self.app.checkin({"reps": 20})
        again = self.app.checkin({"reps": 99})
        today = date.today().isoformat()
        self.assertEqual(again["days"][today]["reps"], 20)
        self.assertEqual(first["days"][today]["mode"], "camera")
        self.assertTrue((Path(self.tmp.name) / "backup" / "waky.json").exists())

    def test_edit_and_delete_day(self):
        self.app.upsert_day({"date": "2026-01-05", "time": "06:10"})
        s = self.app.upsert_day({"date": "2026-01-05", "time": "06:20"})
        self.assertEqual(s["days"]["2026-01-05"]["time"], "06:20")
        s = self.app.delete_day("2026-01-05")
        self.assertNotIn("2026-01-05", s["days"])

    def test_rejects_bad_input(self):
        with self.assertRaises(BadRequest):
            self.app.upsert_day({"date": "2026-01-05", "time": "6:10"})
        with self.assertRaises(BadRequest):
            self.app.upsert_day({"date": "2999-01-01", "time": "06:10"})
        with self.assertRaises(BadRequest):
            self.app.update_settings({"weekday": "25:00"})

    def test_token_not_in_backup(self):
        self.app.store.save_secrets({"token": "123:abc"})
        self.app.checkin({})
        backup = (Path(self.tmp.name) / "backup" / "waky.json").read_text()
        self.assertNotIn("123:abc", backup)

    def test_damaged_file_is_set_aside(self):
        self.app.store.path.write_text("{not json")
        self.app.store.load()
        self.assertTrue(list(Path(self.tmp.name).glob("waky.damaged-*.json")))

    def test_checkin_text(self):
        d = data(day(0, "06:34"), day(1), day(2))
        text = checkin_text(d, TODAY)
        self.assertTrue(text.startswith("✅ Up at 06:34"))
        self.assertIn("3-day streak", text)
        self.assertIn("Milestone: Three in a row", text)


if __name__ == "__main__":
    unittest.main()

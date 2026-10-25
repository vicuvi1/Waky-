import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import insights  # noqa: E402
import notify  # noqa: E402
import recap  # noqa: E402
from server import App, BadRequest  # noqa: E402
from store import DEFAULT_SETTINGS, Store  # noqa: E402


def morning(mood, wake="06:30"):
    return {"time": wake, "target": "06:30", "reps": 0, "mode": "button", "mood": mood}


class InsightsTest(unittest.TestCase):
    def build(self, rows):
        """rows: (mood, bedtime) per morning, oldest first."""
        days, nights = {}, {}
        for i, (mood, bed) in enumerate(rows):
            k = (date(2026, 10, 1) + timedelta(days=i)).isoformat()
            days[k] = morning(mood)
            nights[k] = {"time": bed, "target": "22:30"}
        return insights.insights(days, nights)

    def test_needs_enough_mornings(self):
        r = self.build([("great", "22:30")] * 3)
        self.assertEqual((r["logged"], r["lines"]), (3, []))

    def test_finds_your_sleep_number(self):
        r = self.build([("great", "22:20"), ("great", "22:30"), ("okay", "22:40"), ("great", "22:15"),
                        ("tired", "00:30"), ("tired", "01:00"), ("tired", "00:45")])
        text = " ".join(r["lines"])
        self.assertIn("⚡ great mornings", text)
        self.assertIn("Your number is", text)
        self.assertIn("late bedtimes", text)
        self.assertGreaterEqual(r["threshold"], 6 * 60)

    def test_no_pattern_is_said_honestly(self):
        r = self.build([("great", "22:30"), ("tired", "22:30"), ("great", "22:30"), ("tired", "22:30"), ("okay", "22:30")])
        self.assertIn("No clear pattern yet", r["lines"][0])


class RecapTest(unittest.TestCase):
    def test_month_story(self):
        days = {f"2026-09-{d:02d}": morning("great", t) for d, t in ((1, "06:20"), (2, "06:25"), (3, "06:10"), (5, "07:30"))}
        days["2026-10-01"] = morning("okay")
        data = {"settings": dict(DEFAULT_SETTINGS), "days": days, "telegram": {},
                "nights": {"2026-09-02": {"time": "22:30", "target": "22:30"}}, "opened": {}}
        r = recap.month_recap(data, "2026-09")
        self.assertEqual((r["label"], r["mornings"], r["onTime"], r["daysInMonth"]), ("September 2026", 4, 3, 30))
        self.assertEqual(r["earliest"], {"date": "2026-09-03", "time": "06:10"})
        self.assertEqual(r["longestStreak"], 3)
        self.assertEqual(r["avgSleep"], 475)
        self.assertEqual(r["moods"]["great"], 4)
        self.assertEqual((r["rankFrom"], r["rankTo"]), ("Recruit", "Recruit"))
        self.assertEqual(recap.months_with_data(days), ["2026-10", "2026-09"])


class AppExtrasTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = App(Store(self.tmp.name), background=False)

    def tearDown(self):
        self.tmp.cleanup()

    def test_mood_needs_a_check_in(self):
        with self.assertRaises(BadRequest):
            self.app.set_mood({"mood": "great"})
        self.app.checkin({})
        s = self.app.set_mood({"mood": "great"})
        self.assertEqual(s["days"][date.today().isoformat()]["mood"], "great")
        with self.assertRaises(BadRequest):
            self.app.set_mood({"mood": "angry"})

    def test_themes_unlock_by_rank(self):
        with self.assertRaises(BadRequest) as e:
            self.app.update_settings({"theme": "marble"})
        self.assertIn("Spartan", str(e.exception))
        data = self.app.store.load()
        for i in range(1, 6):  # 5 good mornings: Agoge
            data["days"][(date.today() - timedelta(days=i)).isoformat()] = morning(None)
        self.app.store.save(data)
        self.assertEqual(self.app.update_settings({"theme": "bronze"})["settings"]["theme"], "bronze")

    def test_notification_buttons_need_the_secret(self):
        self.assertIn("expired", self.app.act({"do": "bed", "k": "wrong"}))
        self.assertIn("Going to bed", self.app.act({"do": "bed", "k": self.app.act_key}))
        self.assertTrue(self.app.store.load()["nights"])

    def test_notifications_only_when_the_window_is_closed(self):
        shown = []
        notify.show, real = (lambda *a, **k: shown.append(a)), notify.show
        try:
            self.app.notifications = True
            self.app.notify("t", "b")  # The window was just seen (last_seen = now)
            self.assertEqual(shown, [])
            self.app.last_seen -= 300
            self.app.notify("t", "b", [("Go", "bed")])
            self.assertEqual(len(shown), 1)
            self.assertIn(self.app.act_key, shown[0][2][0][1])
        finally:
            notify.show = real

    def test_toast_xml_escapes_text(self):
        xml = notify.toast_xml("Bed <now>", "A & B", [("Go", "http://x/?a=1&b=2")], sticky=True)
        self.assertIn("&lt;now&gt;", xml)
        self.assertIn("A &amp; B", xml)
        self.assertIn('arguments="http://x/?a=1&amp;b=2"', xml)
        self.assertIn('scenario="reminder"', xml)


if __name__ == "__main__":
    unittest.main()

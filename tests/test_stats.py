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
SETTINGS = {**DEFAULT_SETTINGS, "weekend": "07:00"}


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
        self.assertEqual(s["journey"]["next"]["days"], 1)

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

    def test_journey_counts_total_good_mornings_not_streak(self):
        # 5 good mornings with gaps, plus a late one: still day 5 of the journey.
        recs = [day(0), day(2), day(4), day(6), day(8), day(9, "08:00")]
        s = stats.compute(data(*recs), TODAY)
        j = s["journey"]
        self.assertEqual(j["good"], 5)
        self.assertEqual(j["current"]["days"], 5)
        self.assertEqual(j["level"], 2)
        self.assertEqual(j["next"]["days"], 7)
        self.assertEqual(j["next"]["from"], 5)
        self.assertEqual(s["hit"]["days"], 5)
        self.assertTrue(s["levelUp"])  # Day 5 starts level 2.

    def test_ranks_and_daily_quote(self):
        recs = [day(i) for i in range(10)]
        s = stats.compute(data(*recs), TODAY)
        self.assertEqual((s["journey"]["level"], s["journey"]["rank"]), (3, "Hoplite"))
        self.assertEqual(s["hit"]["rank"], "Hoplite")
        q1 = s["today"]["quote"]
        q2 = stats.compute(data(), TODAY + timedelta(days=1))["today"]["quote"]
        self.assertTrue(q1["text"] and q1["who"])
        self.assertNotEqual(q1["text"], q2["text"])  # A new quote each day.

    def test_preview_shows_what_the_next_check_in_brings(self):
        p = stats.compute(data(), TODAY)["preview"]
        self.assertEqual((p["onTime"], p["early"], p["stage"]["days"], p["levelUp"]), (10, 15, 1, False))
        # 4 good mornings: the next one is day 5, a new level (+20).
        p = stats.compute(data(day(1), day(2), day(3), day(4)), TODAY)["preview"]
        self.assertEqual((p["onTime"], p["early"], p["stage"]["rank"], p["levelUp"], p["streak"]), (30, 35, "Agoge", True, 5))

    def test_every_stage_has_a_tip_and_levels_cover_the_path(self):
        j = stats.compute(data(), TODAY)["journey"]
        self.assertTrue(all(st["tip"] and st["feel"] for st in j["stages"]))
        self.assertEqual([l["from"] for l in j["levels"]], [1, 5, 10, 25, 75])
        self.assertEqual(j["levels"][-1]["to"], 100)

    def test_no_hit_when_today_not_checked_in(self):
        s = stats.compute(data(day(1), day(2), day(3)), TODAY)
        self.assertEqual(s["journey"]["current"]["days"], 3)
        self.assertIsNone(s["hit"])
        self.assertFalse(s["levelUp"])

    def test_empty_journey(self):
        j = stats.compute(data(), TODAY)["journey"]
        self.assertIsNone(j["current"])
        self.assertEqual((j["level"], j["next"]["days"]), (1, 1))


class CoinsTest(unittest.TestCase):
    def test_on_time_early_and_late(self):
        d = data(day(2, "06:40"), day(1, "06:20"), day(0, "07:30"))
        s = stats.compute(d, TODAY)
        self.assertEqual(s["coins"]["earned"], 25)  # 10 on time + 15 early + 0 late
        self.assertEqual(s["today"]["coins"], 0)

    def test_week_bonus_and_level_bonus(self):
        recs = [day(i, "06:40") for i in range(7)]
        coins = stats.coins_by_day(dict(recs), 15)
        by_day = [coins[k][0] for k in sorted(coins)]
        # Day 5 is a new level (+20), day 7 in a row is the week bonus (+5).
        self.assertEqual(by_day, [10, 10, 10, 10, 30, 10, 15])

    def test_spending_and_goal(self):
        d = data(day(1, "06:40"), day(0, "06:40"))
        d["rewards"] = [{"id": "a", "emoji": "🍕", "name": "Pizza", "cost": 60},
                        {"id": "b", "emoji": "🎮", "name": "Games", "cost": 15}]
        d["spent"] = [{"id": "s", "name": "Games", "emoji": "🎮", "cost": 15, "date": "2026-10-21"}]
        c = stats.compute(d, TODAY)["coins"]
        self.assertEqual((c["earned"], c["spent"], c["balance"]), (20, 15, 5))
        self.assertEqual(c["goal"]["id"], "b")  # The cheapest reward not yet affordable.

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
        first = self.app.checkin({"mode": "camera", "reps": 20})
        again = self.app.checkin({})
        today = date.today().isoformat()
        self.assertEqual(again["days"][today]["reps"], 20)
        self.assertEqual(first["days"][today]["mode"], "camera")

    def test_button_checkin_needs_no_push_ups(self):
        s = self.app.checkin({"mode": "button"})
        rec = s["days"][date.today().isoformat()]
        self.assertEqual((rec["mode"], rec["reps"]), ("button", 0))

    def test_rewards_and_redeem(self):
        s = self.app.state()
        self.assertEqual(len(s["rewards"]), 4)  # Defaults for a new user.
        s = self.app.add_reward({"emoji": "🍣", "name": "Sushi", "cost": 5})
        sushi = next(r for r in s["rewards"] if r["name"] == "Sushi")
        with self.assertRaises(BadRequest):
            self.app.redeem({"id": sushi["id"]})  # 0 coins
        self.app.upsert_day({"date": "2026-01-05", "time": "06:00"})  # +15 early
        s = self.app.redeem({"id": sushi["id"]})
        self.assertEqual(s["stats"]["coins"]["balance"], 10)
        s = self.app.undo_redeem(s["spent"][-1]["id"])
        self.assertEqual(s["stats"]["coins"]["balance"], 15)
        s = self.app.delete_reward(sushi["id"])
        self.assertNotIn("Sushi", [r["name"] for r in s["rewards"]])
        with self.assertRaises(BadRequest):
            self.app.add_reward({"name": "  "})
        self.assertTrue((Path(self.tmp.name) / "backup" / "waky.json").exists())

    def test_edit_and_delete_day(self):
        self.app.upsert_day({"date": "2026-01-05", "time": "06:10"})
        s = self.app.upsert_day({"date": "2026-01-05", "time": "06:20"})
        self.assertEqual(s["days"]["2026-01-05"]["time"], "06:20")
        s = self.app.delete_day("2026-01-05")
        self.assertNotIn("2026-01-05", s["days"])

    def test_why_is_saved_trimmed(self):
        s = self.app.update_settings({"why": "  I am the man who\n changes my family's destiny  " + "x" * 300})
        self.assertTrue(s["settings"]["why"].startswith("I am the man who changes my family's destiny"))
        self.assertEqual(len(s["settings"]["why"]), 160)

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
        backup = (Path(self.tmp.name) / "backup" / "waky.json").read_text(encoding="utf-8")
        self.assertNotIn("123:abc", backup)

    def test_backup_catches_up_when_the_drive_appears_later(self):
        # Google Drive starts after Waky: the backup folder isn't reachable at check-in time.
        late_drive = Path(self.tmp.name) / "drive" / "Apps" / "WAKY"
        store = Store(Path(self.tmp.name) / "local", late_drive)
        blocker = Path(self.tmp.name) / "drive"
        blocker.write_text("not a folder yet")  # Makes the backup path unreachable.
        store.save({"settings": {}, "days": {"2026-10-25": {"time": "06:32"}}})
        self.assertFalse(store.backup())
        blocker.unlink()  # The drive shows up a minute later.
        self.assertTrue(store.backup())
        self.assertIn("06:32", (late_drive / "waky.json").read_text(encoding="utf-8"))
        self.assertEqual(len(list((late_drive / "daily").glob("waky-*.json"))), 1)

    def test_daily_backups_are_pruned(self):
        backup_dir = Path(self.tmp.name) / "backup"
        daily = backup_dir / "daily"
        daily.mkdir(parents=True)
        for i in range(70):
            (daily / f"waky-2025-01-{i:02d}.json").write_text("{}")
        self.app.checkin({})
        self.assertEqual(len(list(daily.glob("waky-*.json"))), 60)

    def test_damaged_file_is_set_aside(self):
        self.app.store.path.write_text("{not json")
        self.app.store.load()
        self.assertTrue(list(Path(self.tmp.name).glob("waky.damaged-*.json")))

    def test_checkin_text(self):
        d = data(day(0, "06:34"), day(1), day(2))
        text = checkin_text(d, TODAY)
        self.assertTrue(text.startswith("✅ Up at 06:34"))
        self.assertIn("3-day streak", text)
        self.assertIn("+10 coins", text)
        self.assertIn("Day 3 · The pattern starts", text)
        self.assertNotIn("push-ups", text.replace("20 push-ups", ""))


if __name__ == "__main__":
    unittest.main()

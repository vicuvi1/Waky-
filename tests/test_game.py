import random
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import game  # noqa: E402
import stats  # noqa: E402
from server import App, BadRequest  # noqa: E402
from store import DEFAULT_SETTINGS, Store  # noqa: E402

TODAY = date.today()


def iso(offset):
    return (TODAY - timedelta(days=offset)).isoformat()


def rec(time="06:30"):
    return {"time": time, "target": "06:30", "reps": 0, "mode": "button", "sent": True}


class ChestTest(unittest.TestCase):
    def data(self, *offsets, **extra):
        return {"settings": dict(DEFAULT_SETTINGS), "days": {iso(o): rec() for o in offsets}, "telegram": {}, **extra}

    def test_chests_for_journey_days_runs_and_ranks(self):
        s = stats.compute(self.data(*range(1, 8)), TODAY)  # 7 good mornings in a row, ending yesterday
        ids = [c["id"] for c in s["game"]["chests"]]
        # Journey days 1, 2, 3, 4, 7 are milestones, day 5 is a new rank, and 7 in a row is a streak chest.
        self.assertEqual(ids[:6], ["stage-1", "stage-2", "stage-3", "stage-4", "rank-5", "stage-7"])
        self.assertIn(f"streak-{iso(1)}", ids)
        self.assertEqual(s["game"]["unopened"], 7)

    def test_opened_prize_coins_count_toward_the_balance(self):
        d = self.data(1)
        d["opened"] = {"stage-1": {"prize": {"rarity": "rare", "items": [{"type": "coins", "amount": 45}]}, "openedOn": iso(1)}}
        s = stats.compute(d, TODAY)
        self.assertEqual(s["coins"]["balance"], 10 + 45)
        self.assertEqual(s["game"]["unopened"], 0)

    def test_roll_odds_and_shapes(self):
        rng = random.Random(1)
        rolls = [game.roll("milestone", 1, rng) for _ in range(4000)]
        share = {r: sum(x["rarity"] == r for x in rolls) / len(rolls) for r in game.RARITIES}
        self.assertAlmostEqual(share["common"], 0.55, delta=0.03)
        self.assertAlmostEqual(share["legendary"], 0.05, delta=0.015)
        rank = [game.roll("rank", 3, rng) for _ in range(500)]
        self.assertTrue(all(x["rarity"] != "common" for x in rank))  # Rank chests are never common.
        vouchers = [it for x in rank for it in x["items"] if it["type"] == "voucher"]
        self.assertTrue(vouchers and all(v["tier"] == "gold" for v in vouchers))

    def test_shield_bridges_a_missed_day(self):
        # Good 4, 3, 2 days ago; missed yesterday; good today. Without a shield the streak is 1.
        d = self.data(4, 3, 2, 0)
        self.assertEqual(stats.compute(d, TODAY)["streak"], 1)
        d["shielded"] = [iso(1)]
        s = stats.compute(d, TODAY)
        self.assertEqual(s["streak"], 4)  # The shielded day connects, but doesn't count itself.
        self.assertEqual(s["best"], 4)

    def test_old_starter_rewards_are_upgraded_but_custom_ones_kept(self):
        old = [{"id": f"r{i}", "emoji": "x", "name": "x", "cost": c} for i, c in zip(range(1, 5), (20, 40, 60, 300))]
        self.assertEqual(game.migrate_rewards(old), game.DEFAULT_REWARDS)
        mine = [{"id": "r9", "emoji": "🍣", "name": "Sushi", "cost": 90}]
        self.assertEqual(game.migrate_rewards(mine)[0]["tier"], "bronze")


class PowerUpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = App(Store(self.tmp.name), background=False)

    def tearDown(self):
        self.tmp.cleanup()

    def give(self, *items, chest="stage-99"):
        data = self.app.store.load()
        data["opened"][chest] = {"prize": {"rarity": "epic", "items": list(items)}, "openedOn": iso(5)}
        self.app.store.save(data)

    def set_days(self, *offsets, target="23:59"):
        data = self.app.store.load()
        for o in offsets:
            data["days"][iso(o)] = {**rec(), "target": target}
        data["settings"]["weekday"] = data["settings"]["weekend"] = target  # So today's check-in is on time.
        self.app.store.save(data)

    def test_shield_is_used_by_itself_and_saves_the_streak(self):
        self.set_days(3, 2)  # Good two days, then missed yesterday.
        self.give({"type": "shield"})
        s = self.app.checkin({})
        today = s["days"][iso(0)]
        self.assertEqual(today["shieldUsed"], iso(1))
        self.assertEqual(s["stats"]["streak"], 3)
        self.assertEqual(s["stats"]["game"]["inventory"]["shields"], 0)

    def test_shield_not_wasted_without_a_streak(self):
        self.set_days()
        self.give({"type": "shield"})
        s = self.app.checkin({})
        self.assertNotIn("shieldUsed", s["days"][iso(0)])
        self.assertEqual(s["stats"]["game"]["inventory"]["shields"], 1)

    def test_double_coins(self):
        self.set_days()
        self.give({"type": "double"})
        s = self.app.checkin({})
        self.assertEqual(s["days"][iso(0)]["boost"], 2)
        self.assertEqual(s["stats"]["today"]["coins"], 30)  # (15 early) x 2
        self.assertEqual(s["stats"]["game"]["inventory"]["doubles"], 0)

    def test_tiers_are_locked_by_rank_and_vouchers_work(self):
        self.give({"type": "coins", "amount": 5000}, {"type": "voucher", "tier": "silver"})
        rewards = {r["id"]: r for r in self.app.state()["rewards"]}
        with self.assertRaises(BadRequest) as e:
            self.app.redeem({"id": "g1"})  # Gold needs Hoplite
        self.assertIn("Hoplite", str(e.exception))
        self.set_days(*range(1, 6))  # 5 good mornings: Agoge, silver unlocked
        s = self.app.redeem({"id": "s1", "voucher": True})
        self.assertEqual((s["spent"][-1]["cost"], s["spent"][-1]["voucher"]), (0, "silver"))
        self.assertEqual(s["stats"]["game"]["inventory"]["vouchers"], [])
        with self.assertRaises(BadRequest):
            self.app.redeem({"id": "s1", "voucher": True})  # No voucher left
        self.assertTrue(rewards)

    def test_open_chest_once(self):
        self.set_days(1)
        first = self.app.open_chest({"id": "stage-1"})
        again = self.app.open_chest({"id": "stage-1"})
        self.assertEqual(first["prize"], again["prize"])  # Opening twice never re-rolls.
        with self.assertRaises(BadRequest):
            self.app.open_chest({"id": "rank-5"})  # Not earned yet


if __name__ == "__main__":
    unittest.main()

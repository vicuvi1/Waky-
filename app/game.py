"""The reward game: tiers unlocked by rank, loot chests, power-ups.

Everything here is derived from the saved data, so editing your history keeps it consistent:
- chests are *earned* from your good mornings (milestones, 7-day runs, new ranks),
- what's inside is rolled once when you open one and saved,
- power-ups count as used when they show up in your history (a shielded day, a boosted day, a voucher claim).
"""

import random
from datetime import timedelta

TIERS = [
    {"id": "bronze", "name": "Bronze", "level": 1},
    {"id": "silver", "name": "Silver", "level": 2},
    {"id": "gold", "name": "Gold", "level": 3},
    {"id": "legendary", "name": "Legendary", "level": 4},
]
TIER_LEVEL = {t["id"]: t["level"] for t in TIERS}
TIER_FOR_LEVEL = {1: "bronze", 2: "silver", 3: "gold", 4: "legendary", 5: "legendary"}

DEFAULT_REWARDS = [
    {"id": "b1", "tier": "bronze", "emoji": "🍫", "name": "My favourite snack", "cost": 100},
    {"id": "b2", "tier": "bronze", "emoji": "🎮", "name": "1 hour of gaming, guilt-free", "cost": 150},
    {"id": "s1", "tier": "silver", "emoji": "🎬", "name": "Movie night", "cost": 300},
    {"id": "s2", "tier": "silver", "emoji": "🍕", "name": "Pizza or shawarma", "cost": 400},
    {"id": "g1", "tier": "gold", "emoji": "🍽️", "name": "Dinner out", "cost": 800},
    {"id": "g2", "tier": "gold", "emoji": "🕹️", "name": "A new game", "cost": 1000},
    {"id": "l1", "tier": "legendary", "emoji": "🎁", "name": "Something big I've wanted", "cost": 2500},
]
# The first version's starter rewards; replaced by the new ones if they were never changed.
OLD_DEFAULTS = {("r1", 20), ("r2", 40), ("r3", 60), ("r4", 300)}

RARITIES = ["common", "rare", "epic", "legendary"]

ITEM_LABELS = {
    "shield": ("🛡️", "Streak Shield", "Saves your streak if you miss one day. Used by itself."),
    "double": ("⚡", "Double Coins", "Your next on-time morning pays double. Used by itself."),
    "voucher": ("🎟️", "Voucher", "Claim one reward of this tier or lower for free."),
}

CHEST_INFO = {
    "milestone": ("Milestone chest", "For every new day on your journey."),
    "streak": ("Streak chest", "For every 7 good mornings in a row."),
    "rank": ("Rank chest", "For every new rank. The best loot."),
}


def tier_unlocked(tier, level):
    return TIER_LEVEL.get(tier, 1) <= level


def migrate_rewards(rewards):
    if {(r.get("id"), r.get("cost")) for r in rewards} == OLD_DEFAULTS:
        return [dict(r) for r in DEFAULT_REWARDS]
    return [{**r, "tier": r.get("tier") or "bronze"} for r in rewards]


def connected(prev, d, shielded):
    """True if day d continues a run from prev: next day, or every day between them was shielded."""
    if prev is None:
        return False
    gap = (d - prev).days
    return gap == 1 or (gap > 1 and all((prev + timedelta(days=i)).isoformat() in shielded for i in range(1, gap)))


def earned_chests(good_dates, stage_days, level_starts, shielded):
    """Chests earned by a sorted list of good (on-time) dates."""
    chests = []
    total = run = 0
    prev = None
    for d in good_dates:
        total += 1
        run = run + 1 if connected(prev, d, shielded) else 1
        prev = d
        if total in level_starts:
            chests.append({"id": f"rank-{total}", "kind": "rank", "date": d.isoformat(), "reason": f"Reached day {total}"})
        elif total in stage_days:
            chests.append({"id": f"stage-{total}", "kind": "milestone", "date": d.isoformat(), "reason": f"Day {total} of your journey"})
        if run % 7 == 0:
            chests.append({"id": f"streak-{d.isoformat()}", "kind": "streak", "date": d.isoformat(), "reason": f"{run} days in a row"})
    return chests


def _coins(lo, hi, rng):
    return {"type": "coins", "amount": rng.randint(lo, hi)}


def roll(kind, level, rng=random):
    """What's inside a chest. Returns {"rarity", "items": [...]}."""
    r = rng.random()
    if kind == "rank":
        if r < 0.15:
            return {"rarity": "legendary", "items": [{"type": "voucher", "tier": TIER_FOR_LEVEL[level]}]}
        if r < 0.55:
            return {"rarity": "epic", "items": [{"type": "shield"}, {"type": "coins", "amount": 50}]}
        return {"rarity": "rare", "items": [_coins(80, 120, rng)]}
    if kind == "streak":
        if r < 0.07:
            return {"rarity": "legendary", "items": [{"type": "voucher", "tier": "silver"}]}
        if r < 0.25:
            return {"rarity": "epic", "items": [{"type": "shield"}]}
        if r < 0.55:
            return {"rarity": "rare", "items": [{"type": "double"}, {"type": "coins", "amount": 10}]}
        return {"rarity": "common", "items": [_coins(25, 45, rng)]}
    # milestone
    if r < 0.05:
        return {"rarity": "legendary", "items": [{"type": "voucher", "tier": "bronze"}]}
    if r < 0.20:
        return {"rarity": "epic", "items": [{"type": "shield"}]}
    if r < 0.45:
        return {"rarity": "rare", "items": [rng.choice([_coins(40, 60, rng), {"type": "double"}])]}
    return {"rarity": "common", "items": [_coins(15, 30, rng)]}


def inventory(opened, days, spent, shielded):
    items = [it for o in opened.values() for it in o["prize"]["items"]]
    shields = sum(it["type"] == "shield" for it in items) - len(shielded)
    doubles = sum(it["type"] == "double" for it in items) - sum(bool(r.get("boost")) for r in days.values())
    vouchers = [it["tier"] for it in items if it["type"] == "voucher"]
    for s in spent:
        if s.get("voucher") in vouchers:
            vouchers.remove(s["voucher"])
    vouchers.sort(key=lambda t: TIER_LEVEL[t])
    return {"shields": max(0, shields), "doubles": max(0, doubles), "vouchers": vouchers,
            "chestCoins": sum(it.get("amount", 0) for it in items if it["type"] == "coins")}


def best_voucher_for(tier, vouchers):
    """The lowest voucher that covers this tier, or None."""
    return next((v for v in vouchers if TIER_LEVEL[v] >= TIER_LEVEL.get(tier, 1)), None)


def prize_text(prize):
    parts = []
    for it in prize["items"]:
        if it["type"] == "coins":
            parts.append(f"{it['amount']} coins")
        elif it["type"] == "voucher":
            parts.append(f"{it['tier'].title()} voucher")
        else:
            parts.append(ITEM_LABELS[it["type"]][1])
    return " + ".join(parts)


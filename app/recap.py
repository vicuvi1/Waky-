"""The monthly recap ("Waky Wrapped"): a month of mornings told as a short story."""

from datetime import date, timedelta

import game
import night
import stats
from quotes import quote_for


def months_with_data(days):
    return sorted({k[:7] for k in days}, reverse=True)


def month_recap(data, ym):
    settings, days = data["settings"], data["days"]
    grace = settings["grace"]
    year, month = map(int, ym.split("-"))
    first = date(year, month, 1)
    last = (first.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    in_month = {k: r for k, r in days.items() if k.startswith(ym)}
    shielded = set(data.get("shielded", []))
    nights = data.get("nights", {})

    on_time = [k for k, r in in_month.items() if stats.is_on_time(r, grace)]
    earliest = min(in_month.items(), key=lambda kv: stats.to_minutes(kv[1]["time"]), default=None)

    # Longest on-time streak inside the month.
    best_run = run = 0
    prev = None
    for k in sorted(on_time):
        d = date.fromisoformat(k)
        run = run + 1 if game.connected(prev, d, shielded) else 1
        best_run = max(best_run, run)
        prev = d

    coins = stats.coins_by_day(days, grace, shielded, date.today())
    coins_month = sum(c for k, (c, _) in coins.items() if k.startswith(ym))
    coins_month += sum(night.COINS_BEDTIME for k, r in nights.items() if k.startswith(ym) and night.on_time(r, grace))
    chests = [o for o in data.get("opened", {}).values() if o.get("openedOn", "").startswith(ym)]
    coins_month += sum(it.get("amount", 0) for o in chests for it in o["prize"]["items"] if it["type"] == "coins")

    sleep = [m for k in in_month if (m := night.sleep_minutes(nights.get(k), days.get(k)))]

    # Rank at the start and the end of the month (good mornings so far).
    all_good = sorted(k for k, r in days.items() if stats.is_on_time(r, grace))
    good_before = sum(k < ym for k in all_good)
    good_after = sum(k <= last.isoformat() for k in all_good)
    rank_from, rank_to = stats.journey(good_before)["rank"], stats.journey(good_after)["rank"]

    moods = [r["mood"] for r in in_month.values() if r.get("mood")]
    best_day = date.fromisoformat(earliest[0]) if earliest else first
    return {
        "month": ym,
        "label": first.strftime("%B %Y"),
        "mornings": len(in_month),
        "onTime": len(on_time),
        "daysInMonth": last.day,
        "earliest": {"date": earliest[0], "time": earliest[1]["time"]} if earliest else None,
        "longestStreak": best_run,
        "coins": coins_month,
        "chests": len(chests),
        "bestChest": max((o["prize"]["rarity"] for o in chests), key=game.RARITIES.index, default=None),
        "sleepHours": round(sum(sleep) / 60, 1),
        "avgSleep": round(sum(sleep) / len(sleep)) if sleep else None,
        "rankFrom": rank_from,
        "rankTo": rank_to,
        "goodMornings": good_after,
        "moods": {m: moods.count(m) for m in ("great", "okay", "tired")},
        "quote": quote_for(best_day),
    }

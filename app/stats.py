"""Streaks, coins and the journey, computed from the saved days."""

from datetime import date, datetime, time, timedelta

import game
import night
from quotes import quote_for

LEVELS = {1: "Waking up", 2: "Adjusting", 3: "Body clock locked in", 4: "The habit", 5: "Identity"}
# Who you are at each level: the Spartan path from recruit to legend.
RANKS = {1: "Recruit", 2: "Agoge", 3: "Hoplite", 4: "Spartan", 5: "Legend"}

# What each level means, shown as the level's banner.
LEVEL_INFO = {
    1: "The hardest part. Your body is still fighting the change, so every morning counts double.",
    2: "Training. Your body clock starts following your new time instead of the old one.",
    3: "You stand in the line. Energy comes earlier and more reliably, and mornings stop being a fight.",
    4: "Getting up stops being a decision. It's simply what you do.",
    5: "Not something you do any more. Who you are.",
}

# The journey counts good (on-time) mornings in total, not in a row: a bad day pauses it, never resets it.
# (good mornings, level, title, what's happening, how it may feel, tip for that day)
JOURNEY = [
    (1, 1, "First morning",
     "Your body clock is set mostly by when you wake up and see light. Today you sent it its first new signal.",
     "Probably rough. That's normal.",
     "Open the curtains or turn on a bright light as soon as you're up."),
    (2, 1, "The hard one",
     "Day 2 is often the toughest: the novelty is gone and you may be short on sleep. "
     "The grogginess (sleep inertia) usually fades 15–30 minutes after you're up.",
     "Tired. Get light on your face and move.",
     "Don't sleep in to \"catch up\". Getting up at the same time is what resets your clock."),
    (3, 1, "The pattern starts",
     "Every repeat strengthens the link between \"alarm\" and \"stand up\". Your brain starts treating it as the default.",
     "Still effort, but less arguing with yourself.",
     "Charge your phone across the room again tonight."),
    (4, 1, "Proof",
     "Four mornings is proof to yourself that you can. Self-trust is built from small promises you keep.",
     "A bit proud, still tired.",
     "Go to bed 15 minutes earlier tonight."),
    (5, 2, "Sleepy earlier",
     "Regular wake-ups and morning light move your evening melatonin (the sleep hormone) earlier. "
     "You'll start getting sleepy sooner at night.",
     "Evenings feel sleepier. Go with it.",
     "When you feel sleepy in the evening, go to bed. Don't push through it."),
    (7, 2, "One week",
     "Your body clock has had a week of the same signal and has shifted toward your new time.",
     "Mornings start feeling less like a fight.",
     "Look at your calendar: seven marks. Remember this on a hard morning."),
    (9, 2, "The weekend test",
     "Weekends are where most people slip. Sleeping in two hours shifts your body clock like flying across "
     "time zones, which is why it's called \"social jet lag\".",
     "Tempted to sleep in.",
     "Keep weekends within an hour of your weekday time."),
    (10, 3, "Morning energy",
     "Your body's natural energy boost after waking (the cortisol rise) comes more reliably when your wake time is regular.",
     "More energy in the first hour.",
     "Get 5–10 minutes of outdoor light in the first hour."),
    (12, 3, "Fewer arguments",
     "You negotiate less with the alarm. A decision made in advance takes far less effort in the moment.",
     "Less drama at 06:30.",
     "Lay out your clothes the night before."),
    (14, 3, "Before the alarm",
     "With a steady rhythm, some mornings you'll wake a few minutes before the alarm. Your internal clock is doing the job.",
     "Waking up feels more natural.",
     "If you wake before the alarm, get up. Don't go back to sleep."),
    (17, 3, "Steadier afternoons",
     "A regular sleep schedule tends to soften the afternoon slump that irregular sleep makes worse.",
     "Fewer crashes after lunch.",
     "Keep caffeine before noon so it doesn't push your bedtime later."),
    (21, 3, "Less willpower",
     "The behaviour is shifting from deliberate effort to routine. It costs noticeably less willpower.",
     "Getting up is just what happens.",
     "Decide what the free morning hour is for."),
    (25, 4, "Evenings reorganise",
     "Your evenings start arranging themselves around the wake time: sleepier earlier, less pull to stay up.",
     "Late nights feel less appealing.",
     "Phone out of the bedroom an hour before bed."),
    (30, 4, "One month",
     "A month of steady sleep timing. Regular sleep schedules are linked to better mood, focus and sleep quality.",
     "Clearer head, steadier days.",
     "Claim a reward. You've earned it."),
    (40, 4, "Mornings are yours",
     "The early hours are now reliably yours: quiet time before the rest of the world wakes up.",
     "Calm, ahead of the day.",
     "Keep the first 30 minutes phone-free."),
    (45, 4, "Bad days don't break it",
     "Habit research found that missing a single day doesn't undo the progress. "
     "What matters is getting back on track the next morning.",
     "Confident, even after an off day.",
     "If you slip, the rule is simple: never miss twice."),
    (50, 4, "Fifty",
     "Most attempts at a new routine fade in the first couple of weeks. You're at fifty.",
     "Quietly confident.",
     "Tell someone what you've built."),
    (60, 4, "The new normal",
     "This wake time is now your body's normal. Sleeping late starts to feel off rather than nice.",
     "Sleeping in feels strange.",
     "Keep the same time on holidays when you can."),
    (66, 4, "Automatic",
     "In the best-known study on habit formation, it took 66 days on average for a habit to feel automatic. You're there.",
     "You don't decide to get up. You just do.",
     "Nothing to change. Keep showing up."),
    (75, 5, "Others notice",
     "People around you see the change: the steadiness, the early start, the follow-through.",
     "Steady.",
     "Help someone else start."),
    (90, 5, "A full season",
     "Three months is a full season of mornings. Habits this established tend to survive travel and illness.",
     "Solid.",
     "Set your next goal for those mornings."),
    (100, 5, "Morning person",
     "Not a streak any more. It's who you are.",
     "Proud. You earned this.",
     "Claim the big reward."),
]

COINS_ON_TIME = 10
COINS_EARLY = 15  # Checked in before the target time.
COINS_WEEK_BONUS = 5  # Every 7th on-time day in a row.
COINS_LEVEL_BONUS = 20  # Reaching a new level.
COINS_STILL_UP = 5  # Answering the "still up?" check.
STILL_UP_WINDOW = 10  # Minutes you have to answer it.


def still_up_state(rec, day, today, now_min):
    """'none' (no check that day), 'waiting', 'open', 'done' or 'missed'."""
    due = rec.get("stillUpDue")
    if not due:
        return "none"
    if rec.get("stillUp"):
        return "done"
    if day < today:
        return "missed"
    if now_min is None:
        return "waiting"
    due_min = to_minutes(due)
    if now_min < due_min:
        return "waiting"
    return "open" if now_min <= due_min + rec.get("stillUpWindow", STILL_UP_WINDOW) else "missed"

DEFAULT_REWARDS = game.DEFAULT_REWARDS


def to_minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def from_minutes(total):
    total = int(round(total))
    return f"{total // 60:02d}:{total % 60:02d}"


def target_for(day, settings):
    return settings["weekend"] if day.weekday() >= 5 else settings["weekday"]


def is_on_time(record, grace):
    return to_minutes(record["time"]) <= to_minutes(record["target"]) + grace


def _on_time_dates(days, grace):
    return {date.fromisoformat(d) for d, r in days.items() if is_on_time(r, grace)}


def current_streak(days, grace, today, shielded=()):
    good = _on_time_dates(days, grace)
    if today.isoformat() in days and today not in good:
        return 0  # Checked in late today: the streak is broken.
    # Today still counts as "in progress" until it's checked in, so the streak
    # can end yesterday without being broken. A shielded day bridges the gap without counting.
    cursor = today if today in good else today - timedelta(days=1)
    streak = 0
    while cursor in good or cursor.isoformat() in shielded:
        streak += cursor in good
        cursor -= timedelta(days=1)
    return streak


def best_streak(days, grace, shielded=()):
    best = run = 0
    prev = None
    for d in sorted(_on_time_dates(days, grace)):
        run = run + 1 if game.connected(prev, d, shielded) else 1
        best = max(best, run)
        prev = d
    return best


def coins_by_day(days, grace, shielded=(), today=None, now_min=None):
    """Coins earned on each on-time day: {date: (coins, reasons)}."""
    out = {}
    good_total = run = 0
    prev = None
    level_starts = {level_start(level) for level in LEVELS if level > 1}
    for d in sorted(_on_time_dates(days, grace)):
        rec = days[d.isoformat()]
        good_total += 1
        run = run + 1 if game.connected(prev, d, shielded) else 1
        prev = d
        early = to_minutes(rec["time"]) < to_minutes(rec["target"])
        coins, reasons = (COINS_EARLY, ["early"]) if early else (COINS_ON_TIME, ["on time"])
        if run % 7 == 0:
            coins += COINS_WEEK_BONUS
            reasons.append(f"{run} days in a row")
        if good_total in level_starts:
            coins += COINS_LEVEL_BONUS
            reasons.append("new level")
        if rec.get("boost"):
            coins *= 2
            reasons.append("double coins")
        check = still_up_state(rec, d, today or d, now_min)
        if check == "done":
            coins += COINS_STILL_UP
            reasons.append("still up")
        elif check == "missed":
            coins //= 2
            reasons.append("missed the still-up check (half)")
        out[d.isoformat()] = (coins, reasons)
    return out


def level_start(level):
    return min(n for n, lv, *_ in JOURNEY if lv == level)


def journey(good_total):
    stages = [
        {"days": n, "level": lv, "levelName": LEVELS[lv], "rank": RANKS[lv], "title": t, "text": txt, "feel": feel,
         "tip": tip, "reached": good_total >= n, "bonus": n == level_start(lv) and lv > 1}
        for n, lv, t, txt, feel, tip in JOURNEY
    ]
    current = next((s for s in reversed(stages) if s["reached"]), None)
    upcoming = next((s for s in stages if not s["reached"]), None)
    level = current["level"] if current else 1
    levels = [
        {"level": lv, "rank": RANKS[lv], "name": LEVELS[lv], "text": LEVEL_INFO[lv],
         "from": level_start(lv), "to": max(n for n, l, *_ in JOURNEY if l == lv),
         "reached": good_total >= level_start(lv), "current": lv == level and good_total > 0}
        for lv in LEVELS
    ]
    return {
        "levels": levels,
        "stages": stages,
        "current": current,
        "next": upcoming and {**upcoming, "from": current["days"] if current else 0},
        "level": level,
        "levelName": LEVELS[level],
        "rank": RANKS[level],
        "good": good_total,
    }


def today_rec_of(days, today):
    return days.get(today.isoformat())


def _day_status(record, d, grace, today, first_day):
    if d > today:
        return "future"
    if record:
        return "ontime" if is_on_time(record, grace) else "late"
    if first_day is None or d < first_day:
        return "empty"
    return "pending" if d == today else "missed"


def compute(data, today, now_min=None):
    settings, days = data["settings"], data["days"]
    grace = settings["grace"]
    first_day = min((date.fromisoformat(d) for d in days), default=None)

    shielded = set(data.get("shielded", []))
    streak = current_streak(days, grace, today, shielded)
    best = best_streak(days, grace, shielded)

    # On-time rate over the last 30 days, counted from the first check-in.
    window = [today - timedelta(days=i) for i in range(30)]
    counted = [d for d in window if first_day and d >= first_day and (d < today or d.isoformat() in days)]
    on_time = [d for d in counted if d.isoformat() in days and is_on_time(days[d.isoformat()], grace)]
    rate = round(100 * len(on_time) / len(counted)) if counted else None

    recent = [days[d.isoformat()] for d in window[:14] if d.isoformat() in days]
    avg = from_minutes(sum(to_minutes(r["time"]) for r in recent) / len(recent)) if recent else None

    # Calendar: 5 full weeks ending on this week's Sunday.
    end = today + timedelta(days=6 - today.weekday())
    calendar = []
    for i in range(34, -1, -1):
        d = end - timedelta(days=i)
        rec = days.get(d.isoformat())
        calendar.append({
            "date": d.isoformat(),
            "status": _day_status(rec, d, grace, today, first_day),
            "time": rec["time"] if rec else None,
        })

    chart = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        rec = days.get(d.isoformat())
        chart.append({
            "date": d.isoformat(),
            "time": rec["time"] if rec else None,
            "target": rec["target"] if rec else target_for(d, settings),
            "ontime": bool(rec and is_on_time(rec, grace)),
        })

    coins = coins_by_day(days, grace, shielded, today, now_min)
    good_total = len(coins)
    j = journey(good_total)

    # The game: chests earned, what's been opened, power-ups left.
    opened = data.get("opened", {})
    level_starts = {level_start(lv) for lv in LEVELS if lv > 1}
    chests = game.earned_chests(sorted(_on_time_dates(days, grace)), {n for n, *_ in JOURNEY}, level_starts, shielded)
    for c in chests:
        c["opened"] = c["id"] in opened
        c["prize"] = opened.get(c["id"], {}).get("prize")
        c["name"], c["info"] = game.CHEST_INFO[c["kind"]]
    inv = game.inventory(opened, days, data.get("spent", []), shielded)

    nights = data.get("nights", {})
    night_coins = night.coins(nights, grace)
    earned = sum(c for c, _ in coins.values()) + inv["chestCoins"] + sum(night_coins.values())
    spent = sum(s["cost"] for s in data.get("spent", []))
    balance = earned - spent
    rewards = sorted(data.get("rewards", []), key=lambda r: r["cost"])
    unlocked = [r for r in rewards if game.tier_unlocked(r.get("tier"), j["level"])]
    goal = next((r for r in unlocked if r["cost"] > balance), None)

    # A shield will save the streak if yesterday was missed and today is checked in on time.
    yesterday = today - timedelta(days=1)
    at_risk = current_streak(days, grace, yesterday, shielded) if (
        not today_rec_of(days, today) and yesterday.isoformat() not in days
        and yesterday.isoformat() not in shielded) else 0
    today_rec = days.get(today.isoformat())
    today_ontime = bool(today_rec and is_on_time(today_rec, grace))
    next_good = good_total + 1
    next_stage = next((st for st in j["stages"] if st["days"] == next_good), None)
    # The streak the next on-time morning would make (today if not done yet, else tomorrow).
    run_after = (streak + 1) if (not today_rec or today_ontime) else 1
    week_bonus = COINS_WEEK_BONUS if run_after % 7 == 0 else 0
    level_bonus = COINS_LEVEL_BONUS if next_stage and next_stage["bonus"] else 0
    preview = {
        "onTime": COINS_ON_TIME + week_bonus + level_bonus,
        "early": COINS_EARLY + week_bonus + level_bonus,
        "stage": next_stage,
        "levelUp": bool(level_bonus),
        "streak": run_after,
    }
    hit = j["current"] if today_ontime and j["current"] and j["current"]["days"] == good_total else None
    prev_level = journey(good_total - 1)["level"] if today_ontime else j["level"]
    return {
        "today": {
            "date": today.isoformat(),
            "target": target_for(today, settings),
            "weekend": today.weekday() >= 5,
            "record": today_rec,
            "ontime": today_ontime,
            "coins": coins.get(today.isoformat(), (0, []))[0],
            "coinReasons": coins.get(today.isoformat(), (0, []))[1],
            "quote": quote_for(today),
            "stillUp": {
                "state": still_up_state(today_rec, today, today, now_min) if today_rec else "none",
                "due": today_rec.get("stillUpDue") if today_rec else None,
                "deadline": from_minutes(to_minutes(today_rec["stillUpDue"]) + today_rec.get("stillUpWindow", STILL_UP_WINDOW))
                if today_rec and today_rec.get("stillUpDue") else None,
            },
        },
        "streak": streak,
        "best": best,
        "rate": rate,
        "avg": avg,
        "total": len(days),
        "calendar": calendar,
        "chart": chart,
        "journey": j,
        "hit": hit,
        "levelUp": bool(hit and j["level"] > prev_level),
        "coins": {"balance": balance, "earned": earned, "spent": spent, "goal": goal},
        "preview": {**preview, "double": inv["doubles"] > 0},
        "night": {
            **night.tonight(datetime.combine(today, time(*divmod(now_min if now_min is not None else 720, 60))),
                            settings, target_for, nights, days),
            "enabled": settings.get("bedtimeOn", True),
            "coins": night.COINS_BEDTIME,
        },
        "sleep": night.sleep_stats(nights, days, today, settings.get("sleepGoal", 480)),
        "game": {
            "chests": chests,
            "unopened": sum(not c["opened"] for c in chests),
            "inventory": inv,
            "tiers": [{**t, "unlocked": t["level"] <= j["level"], "rank": RANKS[t["level"]]} for t in game.TIERS],
            "shieldSave": at_risk if inv["shields"] and at_risk else 0,
            "streakAtRisk": at_risk,
            "newChests": [c for c in chests if c["date"] == today.isoformat()],
        },
    }

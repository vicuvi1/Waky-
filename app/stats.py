"""Streaks, coins and the journey, computed from the saved days."""

from datetime import date, timedelta

from quotes import quote_for

LEVELS = {1: "Waking up", 2: "Adjusting", 3: "Body clock locked in", 4: "The habit", 5: "Identity"}
# Who you are at each level: the Spartan path from recruit to legend.
RANKS = {1: "Recruit", 2: "Agoge", 3: "Hoplite", 4: "Spartan", 5: "Legend"}

# The journey counts good (on-time) mornings in total, not in a row: a bad day pauses it, never resets it.
# (good mornings, level, title, what's happening, how it may feel)
JOURNEY = [
    (1, 1, "First morning",
     "Your body clock is set mostly by when you wake up and see light. Today you sent it its first new signal.",
     "Probably rough. That's normal."),
    (2, 1, "The hard one",
     "Day 2 is often the toughest: the novelty is gone and you may be short on sleep. "
     "The grogginess (sleep inertia) usually fades 15–30 minutes after you're up.",
     "Tired. Get light on your face and move."),
    (3, 1, "The pattern starts",
     "Every repeat strengthens the link between \"alarm\" and \"stand up\". Your brain starts treating it as the default.",
     "Still effort, but less arguing with yourself."),
    (5, 2, "Sleepy earlier",
     "Regular wake-ups and morning light move your evening melatonin (the sleep hormone) earlier. "
     "You'll start getting sleepy sooner at night.",
     "Evenings feel sleepier. Go with it."),
    (7, 2, "One week",
     "Your body clock has had a week of the same signal and has shifted toward your new time.",
     "Mornings start feeling less like a fight."),
    (10, 3, "Morning energy",
     "Your body's natural energy boost after waking (the cortisol rise) comes more reliably when your wake time is regular.",
     "More energy in the first hour."),
    (14, 3, "Before the alarm",
     "With a steady rhythm, some mornings you'll wake a few minutes before the alarm. Your internal clock is doing the job.",
     "Waking up feels more natural."),
    (21, 3, "Less willpower",
     "The behaviour is shifting from deliberate effort to routine. It costs noticeably less willpower.",
     "Getting up is just what happens."),
    (30, 4, "One month",
     "A month of steady sleep timing. Regular sleep schedules are linked to better mood, focus and sleep quality.",
     "Clearer head, steadier days."),
    (45, 4, "Bad days don't break it",
     "Habit research found that missing a single day doesn't undo the progress. "
     "What matters is getting back on track the next morning.",
     "Confident, even after an off day."),
    (66, 4, "Automatic",
     "In the best-known study on habit formation, it took 66 days on average for a habit to feel automatic. You're there.",
     "You don't decide to get up. You just do."),
    (100, 5, "Morning person",
     "Not a streak any more. It's who you are.",
     "Proud. You earned this."),
]

COINS_ON_TIME = 10
COINS_EARLY = 15  # Checked in before the target time.
COINS_WEEK_BONUS = 5  # Every 7th on-time day in a row.
COINS_LEVEL_BONUS = 20  # Reaching a new level.

DEFAULT_REWARDS = [
    {"id": "r1", "emoji": "🎮", "name": "1 hour of gaming, guilt-free", "cost": 20},
    {"id": "r2", "emoji": "🎬", "name": "Movie night", "cost": 40},
    {"id": "r3", "emoji": "🍕", "name": "Pizza or shawarma", "cost": 60},
    {"id": "r4", "emoji": "🎁", "name": "Something I've wanted to buy", "cost": 300},
]


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


def current_streak(days, grace, today):
    good = _on_time_dates(days, grace)
    if today.isoformat() in days and today not in good:
        return 0  # Checked in late today: the streak is broken.
    # Today still counts as "in progress" until it's checked in, so the streak
    # can end yesterday without being broken.
    cursor = today if today in good else today - timedelta(days=1)
    streak = 0
    while cursor in good:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def best_streak(days, grace):
    best = run = 0
    prev = None
    for d in sorted(_on_time_dates(days, grace)):
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d
    return best


def coins_by_day(days, grace):
    """Coins earned on each on-time day: {date: (coins, reasons)}."""
    out = {}
    good_total = run = 0
    prev = None
    level_starts = {min(n for n, lv, *_ in JOURNEY if lv == level) for level in LEVELS if level > 1}
    for d in sorted(_on_time_dates(days, grace)):
        rec = days[d.isoformat()]
        good_total += 1
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        prev = d
        early = to_minutes(rec["time"]) < to_minutes(rec["target"])
        coins, reasons = (COINS_EARLY, ["early"]) if early else (COINS_ON_TIME, ["on time"])
        if run % 7 == 0:
            coins += COINS_WEEK_BONUS
            reasons.append(f"{run} days in a row")
        if good_total in level_starts:
            coins += COINS_LEVEL_BONUS
            reasons.append("new level")
        out[d.isoformat()] = (coins, reasons)
    return out


def journey(good_total):
    stages = [
        {"days": n, "level": lv, "levelName": LEVELS[lv], "rank": RANKS[lv], "title": t, "text": txt, "feel": feel,
         "reached": good_total >= n}
        for n, lv, t, txt, feel in JOURNEY
    ]
    current = next((s for s in reversed(stages) if s["reached"]), None)
    upcoming = next((s for s in stages if not s["reached"]), None)
    level = current["level"] if current else 1
    return {
        "stages": stages,
        "current": current,
        "next": upcoming and {**upcoming, "from": current["days"] if current else 0},
        "level": level,
        "levelName": LEVELS[level],
        "rank": RANKS[level],
        "good": good_total,
    }


def _day_status(record, d, grace, today, first_day):
    if d > today:
        return "future"
    if record:
        return "ontime" if is_on_time(record, grace) else "late"
    if first_day is None or d < first_day:
        return "empty"
    return "pending" if d == today else "missed"


def compute(data, today):
    settings, days = data["settings"], data["days"]
    grace = settings["grace"]
    first_day = min((date.fromisoformat(d) for d in days), default=None)

    streak = current_streak(days, grace, today)
    best = best_streak(days, grace)

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

    coins = coins_by_day(days, grace)
    earned = sum(c for c, _ in coins.values())
    spent = sum(s["cost"] for s in data.get("spent", []))
    balance = earned - spent
    rewards = sorted(data.get("rewards", []), key=lambda r: r["cost"])
    goal = next((r for r in rewards if r["cost"] > balance), None)

    good_total = len(coins)
    j = journey(good_total)
    today_rec = days.get(today.isoformat())
    today_ontime = bool(today_rec and is_on_time(today_rec, grace))
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
    }

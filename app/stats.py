"""Streaks, averages and milestones, computed from the saved days."""

from datetime import date, timedelta

MILESTONES = [
    (1, "Day one", "You got up. That's the whole game, repeated."),
    (3, "Three in a row", "The first days are the hardest. You're past them."),
    (7, "One week", "A steady wake time is the strongest signal your body clock gets. It's starting to adjust."),
    (14, "Two weeks", "Mornings start to feel less brutal. Your body is learning to expect this time."),
    (21, "Three weeks", "Getting up is becoming the default, not a fight."),
    (30, "One month", "Thirty mornings. This is who you are now, not something you're trying."),
    (66, "66 days", "On average it takes about 66 days for a habit to feel automatic. You're there."),
    (100, "100 days", "Triple digits. Most people never get here."),
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

    milestones = [
        {"days": n, "title": t, "text": txt, "reached": best >= n}
        for n, t, txt in MILESTONES
    ]
    upcoming = next((m for m in milestones if m["days"] > streak), None)
    prev_days = max([m["days"] for m in milestones if m["days"] <= streak], default=0)

    today_rec = days.get(today.isoformat())
    return {
        "today": {
            "date": today.isoformat(),
            "target": target_for(today, settings),
            "weekend": today.weekday() >= 5,
            "record": today_rec,
            "ontime": bool(today_rec and is_on_time(today_rec, grace)),
        },
        "streak": streak,
        "best": best,
        "rate": rate,
        "avg": avg,
        "total": len(days),
        "calendar": calendar,
        "chart": chart,
        "milestones": milestones,
        "next": upcoming and {**upcoming, "from": prev_days},
        "hit": next((m for m in milestones if m["days"] == streak), None),
    }

"""The night side: bedtime, going to bed on time, and how long you slept.

A night belongs to the morning it leads to: going to bed at 23:10 on the 25th, or at 00:30 on the
26th, are both the night of the 26th. Times are compared as minutes since noon, so 22:30 comes
before 00:30.
"""

from datetime import timedelta

COINS_BEDTIME = 5  # In bed on time.
EVENING_STARTS = 5 * 60  # The bedtime card shows from 17:00 (5 hours after noon).


def since_noon(hhmm):
    h, m = map(int, hhmm.split(":"))
    return (h * 60 + m - 720) % 1440


def from_since_noon(rel):
    total = (rel + 720) % 1440
    return f"{total // 60:02d}:{total % 60:02d}"


def morning_for(moment):
    """The morning a moment's night leads to: before noon it's today, after noon it's tomorrow."""
    return moment.date() if moment.hour < 12 else moment.date() + timedelta(days=1)


def bedtime_for(wake_hhmm, settings):
    return from_since_noon(since_noon(wake_hhmm) - settings["sleepGoal"])


def on_time(record, grace):
    return since_noon(record["time"]) <= since_noon(record["target"]) + grace


def sleep_minutes(night_rec, day_rec):
    if not night_rec or not day_rec:
        return None
    minutes = since_noon(day_rec["time"]) - since_noon(night_rec["time"])
    return minutes if 60 <= minutes <= 16 * 60 else None  # Ignore nonsense (pressed at the wrong time).


def coins(nights, grace):
    return {k: COINS_BEDTIME for k, r in nights.items() if on_time(r, grace)}


def tonight(now, settings, target_for, nights, days):
    """Everything the evening screen needs about tonight."""
    morning = morning_for(now)
    wake = target_for(morning, settings)
    bedtime = bedtime_for(wake, settings)
    rec = nights.get(morning.isoformat())
    now_rel = since_noon(now.strftime("%H:%M"))
    bed_rel = since_noon(bedtime)
    remind_rel = bed_rel - settings["bedRemind"]
    if now_rel < EVENING_STARTS or now_rel >= since_noon(wake):
        state = "day"  # Afternoon, or already morning: no bedtime screen.
    elif rec:
        state = "done"
    elif now_rel < remind_rel:
        state = "evening"
    elif now_rel < bed_rel:
        state = "remind"
    elif now_rel <= bed_rel + settings["grace"]:
        state = "due"
    else:
        state = "late"
    return {
        "morning": morning.isoformat(), "wake": wake, "bedtime": bedtime,
        "remindAt": from_since_noon(remind_rel), "state": state, "record": rec,
        "minutesLeft": bed_rel - now_rel,
        "onTime": bool(rec and on_time(rec, settings["grace"])),
        "sleepIfNow": since_noon(wake) - now_rel,
    }


def sleep_stats(nights, days, today, goal):
    last = sleep_minutes(nights.get(today.isoformat()), days.get(today.isoformat()))
    chart, recent = [], []
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        m = sleep_minutes(nights.get(d), days.get(d))
        chart.append({"date": d, "minutes": m})
        if m is not None:
            recent.append(m)
    return {
        "last": last,
        "avg": round(sum(recent) / len(recent)) if recent else None,
        "goal": goal,
        "chart": chart,
        "nightsOnGoal": sum(m >= goal - 15 for m in recent),
        "nights": len(recent),
    }

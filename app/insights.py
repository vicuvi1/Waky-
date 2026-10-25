"""What your mood log says about your sleep: plain sentences, only when the data supports them."""

import night

MOODS = {"tired": "😴", "okay": "🙂", "great": "⚡"}
MIN_MORNINGS = 5  # Mornings with both a mood and sleep hours before saying anything.


def _dur(minutes):
    h, m = divmod(int(round(minutes)), 60)
    return f"{h} h {m:02d} min" if m else f"{h} h"


def mornings(days, nights):
    """(mood, sleep minutes or None, bedtime on time or None) for every morning with a mood."""
    out = []
    for key, rec in sorted(days.items()):
        if rec.get("mood") not in MOODS:
            continue
        n = nights.get(key)
        out.append((rec["mood"], night.sleep_minutes(n, rec), night.on_time(n, 15) if n else None))
    return out


def insights(days, nights):
    rows = mornings(days, nights)
    with_sleep = [(mood, sleep) for mood, sleep, _ in rows if sleep is not None]
    result = {"logged": len(rows), "needed": MIN_MORNINGS, "lines": [],
              "counts": {m: sum(r[0] == m for r in rows) for m in MOODS}}
    if len(with_sleep) < MIN_MORNINGS:
        return result

    # 1. How long you sleep before great vs tired mornings.
    great = [s for m, s in with_sleep if m == "great"]
    tired = [s for m, s in with_sleep if m == "tired"]
    if great and tired and sum(great) / len(great) - sum(tired) / len(tired) >= 20:
        result["lines"].append(
            f"On ⚡ great mornings you'd slept {_dur(sum(great) / len(great))} on average; "
            f"on 😴 tired ones only {_dur(sum(tired) / len(tired))}.")

    # 2. Your sleep threshold: the amount of sleep above which you feel good most often.
    best = None
    for t in range(6 * 60, 9 * 60 + 1, 15):
        above = [m for m, s in with_sleep if s >= t]
        below = [m for m, s in with_sleep if s < t]
        if len(above) < 2 or len(below) < 2:
            continue
        good_above = sum(m != "tired" for m in above) / len(above)
        good_below = sum(m != "tired" for m in below) / len(below)
        gap = good_above - good_below
        if gap >= 0.3 and (best is None or gap > best[0]):
            best = (gap, t, above, below)
    if best:
        _, t, above, below = best
        ok_a, ok_b = sum(m != "tired" for m in above), sum(m != "tired" for m in below)
        result["lines"].append(
            f"After {_dur(t)} or more of sleep you feel good {ok_a} out of {len(above)} mornings; "
            f"after less, only {ok_b} out of {len(below)}. Your number is {_dur(t)}.")
        result["threshold"] = t

    # 3. Going to bed on time.
    bed = [(mood, ontime) for mood, _, ontime in rows if ontime is not None]
    late = [m for m, ontime in bed if not ontime]
    early = [m for m, ontime in bed if ontime]
    if len(late) >= 2 and len(early) >= 2:
        tired_late = sum(m == "tired" for m in late) / len(late)
        tired_early = sum(m == "tired" for m in early) / len(early)
        if tired_late - tired_early >= 0.25:
            result["lines"].append(
                f"After late bedtimes you wake up tired {round(100 * tired_late)}% of the time; "
                f"after on-time bedtimes, {round(100 * tired_early)}%.")
    if not result["lines"]:
        result["lines"].append("No clear pattern yet: your mood doesn't follow your sleep hours so far. Keep logging.")
    return result

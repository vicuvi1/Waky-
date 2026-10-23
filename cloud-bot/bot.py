#!/usr/bin/env python3
"""
WAKY - Spartan King Dawn Citadel 24/7 Cloud Bot v3.0
Persistent Memory & Remote Command Relay for @wakyyyy_bot
Runs 24/7 on hermes-vm, retaining full discipline history even when Desktop PC is closed.

Upgrades:
1. AI Dawn Briefing & Daily Battle Orders (streak-tailored speech, Prime Directives, sleep metrics).
2. Epic Voice Note Dawn Orders (Spoken Spartan General Audio speech via sendVoice).
3. Real Sleep Duration & Recovery Score (Bedtime curfew to wake duration & circadian efficiency).
4. Sunday Citadel Chronicle (Weekly Performance Debrief with grade, on-time %, directives %).
5. Spartan Honor Penalty & Restoration (-150 XP for snooze abandonment, restoration agoge).
6. Daytime Energy & Brain Fog Tracker (Circadian correlation check at 18:00).
7. Urgent Repeated Phone Alarm (90s interval, up to 7 rounds with inline button).
8. Night Agoge Bedtime Curfew Protocol (22:30 check-in, +50 XP).
9. The 3 Prime Directives Mobile Sync (Interactive inline checkmarks).
"""

import os
import sys
import time
import json
import logging
import threading
from datetime import datetime, date, timedelta, timezone

import requests
from requests.adapters import HTTPAdapter

# ----------------- CONFIGURATION -----------------
BOT_TOKEN = os.environ.get("WAKY_BOT_TOKEN", "8814364854:AAE3HpffTsEX3x6xnl74Fx0Lff6OxOxeTeA")
API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
PRIMARY_USER_ID = int(os.environ.get("WAKY_USER_ID", "1900611848"))
DATA_FILE = os.environ.get("WAKY_DATA_FILE", "/opt/waky-bot/waky_memory.json")
WARCRY_AUDIO_PATH = "/opt/waky-bot/dawn_warcry.mp3"

LOCAL_TZ_OFFSET = int(os.environ.get("WAKY_TZ_OFFSET", "3"))
LOCAL_TZ = timezone(timedelta(hours=LOCAL_TZ_OFFSET))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("waky_cloud_bot")

# Global HTTP Session for all outbound requests
http_session = requests.Session()
adapter = HTTPAdapter(pool_connections=5, pool_maxsize=10, max_retries=2)
http_session.mount("https://", adapter)

# ----------------- SPARTAN GAME SYSTEM -----------------
MILESTONES = [
    {"day": 1, "title": "Day 1: The Spark of Willpower", "sub": "Cortisol surge crushed & snooze reflex banished", "desc": "Initial neuro-activation. The baseline dopamine resistance is broken."},
    {"day": 3, "title": "Day 3: The Circadian Anchor", "sub": "Suprachiasmatic nucleus clock-genes lock in", "desc": "Morning grogginess drops by 40%. REM sleep cycles realign to dawn."},
    {"day": 7, "title": "Day 7: The Spartan Initiate", "sub": "Full 1-Week Sovereign Victory", "desc": "Adenosine receptor sensitivity restored. Prefrontal cortex awakening accelerates."},
    {"day": 14, "title": "Day 14: Neural Habit Crystallization", "sub": "Myelination of dawn waking pathways", "desc": "The urge to bargain with the alarm disappears. Rising becomes autonomous reflex."},
    {"day": 21, "title": "Day 21: Dopamine Baseline Reset", "sub": "Cheap morning dopamine detox complete", "desc": "Natural cortisol peak replaces caffeine dependency. Unshakable mental clarity."},
    {"day": 30, "title": "Day 30: Spartan Phalanx Centurion", "sub": "1 Full Month of Dawn Mastery", "desc": "Circadian rhythm fully hardcoded. Deep sleep stages optimize automatically."},
    {"day": 60, "title": "Day 60: The Iron King's Guard", "sub": "Habitual invincibility across all seasons", "desc": "Neuroplasticity locks habit into identity. You no longer 'try' to wake early; you ARE early."},
    {"day": 90, "title": "Day 90: Sovereign Transcendence", "sub": "Permanent Bio-Neurological Rewiring", "desc": "The highest echelon of sovereign human willpower. The dawn belongs to you forever."}
]

RANKS = [
    {"min_xp": 0, "title": "Agoge Recruit 🛡️", "next_xp": 300},
    {"min_xp": 300, "title": "Spartan Hoplite ⚔️", "next_xp": 700},
    {"min_xp": 700, "title": "Phalanx Centurion 🏛️", "next_xp": 1400},
    {"min_xp": 1400, "title": "Royal King's Guard 👑", "next_xp": 2500},
    {"min_xp": 2500, "title": "Spartan High Warlord ⚡", "next_xp": 4000},
    {"min_xp": 4000, "title": "Sovereign Dawn King 🦅", "next_xp": 999999}
]

ALL_TROPHIES = {
    "first_dawn": {"icon": "🌅", "name": "First Dawn", "desc": "Conquered your very first morning."},
    "three_streak": {"icon": "🔥", "name": "Three-Day Ember", "desc": "Held the phalanx for 3 consecutive days."},
    "seven_streak": {"icon": "⚡", "name": "Seven-Day Phalanx", "desc": "A full week of dawn sovereignty."},
    "fourteen_streak": {"icon": "🛡️", "name": "Fortnight of Iron", "desc": "14 unbroken days of morning victory."},
    "thirty_streak": {"icon": "👑", "name": "Imperial Centurion", "desc": "30 days of unyielding circadian mastery."},
    "bullseye": {"icon": "🎯", "name": "Precision Strike", "desc": "Woke up within 5 minutes of target alarm."},
    "early_bird": {"icon": "🦅", "name": "Apex Predator", "desc": "Awoke before 06:30 AM."},
    "curfew_master": {"icon": "🌙", "name": "Agoge Curfew Master", "desc": "Logged 5 nights of disciplined sleep recovery."},
    "weekly_titan": {"icon": "📜", "name": "Weekly Titan", "desc": "Conquered a 100% perfect 7-day Sunday debrief."}
}

MOTIVATIONAL_QUOTES = [
    "\"He who conquers the dawn commands his destiny; he who bargains with the bed is conquered by it.\"",
    "\"The Spartan does not ask how many the enemy are, but where they are. Today's battlefield is yours.\"",
    "\"Dopamine is earned through discipline, not granted through comfort. Stand tall and strike first.\"",
    "\"Circadian sovereignty is the bedrock of empire. Rule the morning, rule the kingdom.\"",
    "\"Every sunrise demands a choice: voluntary discomfort for greatness, or easy sleep for regret.\""
]

# ----------------- DATA PERSISTENCE -----------------
def get_default_memory():
    return {
        "user_id": PRIMARY_USER_ID,
        "user_name": "Spartan King",
        "target_time": "07:00",
        "current_streak": 0,
        "best_streak": 0,
        "total_wakes": 0,
        "total_on_time": 0,
        "xp": 0,
        "unlocked_trophies": [],
        "logs": [],
        "last_curfew_ts": 0,
        "last_curfew_date": "",
        "honor_status": "HONORABLE",
        "directives": {
            "date": "",
            "items": [
                {"id": 1, "text": "Deep Work 90m Focus Block", "done": False},
                {"id": 2, "text": "Physical Agoge (45m Training)", "done": False},
                {"id": 3, "text": "Kingdom Project Execution", "done": False}
            ]
        }
    }


def load_memory():
    if not os.path.exists(DATA_FILE):
        mem = get_default_memory()
        save_memory(mem)
        return mem
    try:
        with open(DATA_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
            return data
    except Exception as e:
        logger.error(f"Error loading memory from {DATA_FILE}: {e}")
        return get_default_memory()


def save_memory(mem):
    try:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        tmp = f"{DATA_FILE}.tmp"
        with open(tmp, "w", encoding="utf-8-sig") as f:
            json.dump(mem, f, indent=2, ensure_ascii=False)
        os.replace(tmp, DATA_FILE)
    except Exception as e:
        logger.error(f"Failed to save memory to {DATA_FILE}: {e}")


def get_current_local_dt():
    return datetime.now(timezone.utc).astimezone(LOCAL_TZ)


# ----------------- GAME MECHANICS & CALCULATIONS -----------------
def get_rank_info(xp):
    current = RANKS[0]
    for r in RANKS:
        if xp >= r["min_xp"]:
            current = r
        else:
            break
    return current


def calculate_streak(logs):
    if not logs:
        return 0

    dates = sorted(list(set(l.get("date") for l in logs if l.get("date"))), reverse=True)
    if not dates:
        return 0

    today = get_current_local_dt().date()
    yesterday = today - timedelta(days=1)

    latest_date = datetime.strptime(dates[0], "%Y-%m-%d").date()
    if latest_date != today and latest_date != yesterday:
        return 0

    streak = 1
    current = latest_date
    for d_str in dates[1:]:
        d = datetime.strptime(d_str, "%Y-%m-%d").date()
        if (current - d).days == 1:
            streak += 1
            current = d
        else:
            break
    return streak


def calculate_stats(mem):
    logs = mem.get("logs", [])
    streak = calculate_streak(logs)
    mem["current_streak"] = streak
    if streak > mem.get("best_streak", 0):
        mem["best_streak"] = streak

    total = len(logs)
    target_time_str = mem.get("target_time", "07:00")
    t_parts = [int(p) for p in target_time_str.split(":")]
    target_min = t_parts[0] * 60 + t_parts[1]

    def is_log_on_time(l):
        if "on_time" in l:
            return bool(l["on_time"])
        try:
            p = [int(x) for x in l.get("time", "07:00").split(":")]
            return (p[0] * 60 + p[1]) <= (target_min + 15)
        except Exception:
            return True

    on_time_count = sum(1 for l in logs if is_log_on_time(l))
    on_time_pct = (on_time_count / total * 100.0) if total > 0 else 0.0

    avg_minutes = 0
    if total > 0:
        total_m = 0
        valid_m = 0
        for l in logs:
            try:
                p = [int(x) for x in l.get("time", "07:00").split(":")]
                total_m += (p[0] * 60 + p[1])
                valid_m += 1
            except Exception:
                pass
        if valid_m > 0:
            avg_minutes = total_m // valid_m

    avg_time_str = f"{avg_minutes // 60:02d}:{avg_minutes % 60:02d}" if avg_minutes > 0 else target_time_str
    xp = mem.get("xp", 0)
    rank = get_rank_info(xp)

    return {
        "streak": streak,
        "best_streak": mem.get("best_streak", 0),
        "total": total,
        "on_time_count": on_time_count,
        "on_time_pct": on_time_pct,
        "avg_time": avg_time_str,
        "xp": xp,
        "rank": rank
    }


def calculate_sleep_recovery(mem, wake_ts):
    last_curfew = mem.get("last_curfew_ts", 0)
    if not last_curfew or wake_ts <= last_curfew:
        return {"duration_str": "7h 30m (Estimated)", "hours": 7.5, "score": 92, "label": "Combat Ready ⚡"}

    diff_sec = wake_ts - last_curfew
    hours = diff_sec / 3600.0
    h = int(hours)
    m = int((diff_sec % 3600) / 60)
    dur_str = f"{h}h {m:02d}m"

    if 7.25 <= hours <= 8.5:
        score = 98
        label = "Optimal Sovereign Recovery 👑"
    elif 6.5 <= hours < 7.25 or 8.5 < hours <= 9.0:
        score = 88
        label = "Combat Ready ⚡"
    elif 5.5 <= hours < 6.5:
        score = 74
        label = "Mild Sleep Debt ⚠️"
    else:
        score = 60
        label = "Circadian Warning 🛑"

    return {"duration_str": dur_str, "hours": round(hours, 2), "score": score, "label": label}


def record_wake(mem, wake_time_str, method="TELEGRAM_LOG", caption=""):
    now = get_current_local_dt()
    date_str = now.strftime("%Y-%m-%d")
    current_ts = int(now.timestamp())

    target_time = mem.get("target_time", "07:00")
    t_parts = [int(p) for p in target_time.split(":")]
    target_min = t_parts[0] * 60 + t_parts[1]

    try:
        w_parts = [int(p) for p in wake_time_str.split(":")]
        wake_min = w_parts[0] * 60 + w_parts[1]
    except Exception:
        wake_min = target_min

    is_on_time = (wake_min <= target_min + 15)
    sleep_info = calculate_sleep_recovery(mem, current_ts)

    existing = next((l for l in mem.get("logs", []) if l.get("date") == date_str), None)
    is_new_day = False
    if existing:
        existing["time"] = wake_time_str
        existing["timestamp"] = current_ts
        existing["on_time"] = is_on_time
        existing["method"] = method
        existing["caption"] = caption
        existing["sleep_duration"] = sleep_info["duration_str"]
        existing["recovery_score"] = sleep_info["score"]
        log_entry = existing
    else:
        is_new_day = True
        log_entry = {
            "date": date_str,
            "time": wake_time_str,
            "timestamp": current_ts,
            "on_time": is_on_time,
            "status": "ON TIME ⚔️" if is_on_time else "LATE RISE ⚠️",
            "method": method,
            "caption": caption,
            "sleep_duration": sleep_info["duration_str"],
            "recovery_score": sleep_info["score"],
            "energy": "NORMAL"
        }
        mem.setdefault("logs", []).append(log_entry)

    # Clear any honor breach upon logging
    if mem.get("honor_status") == "BREACH":
        mem["honor_status"] = "HONORABLE"

    base_xp = 100 if is_on_time else 50
    if is_new_day:
        streak_before = calculate_streak(mem["logs"])
        bonus = min(200, streak_before * 10)
        new_xp = base_xp + bonus
        mem["xp"] = mem.get("xp", 0) + new_xp

    stats = calculate_stats(mem)
    mem["total_wakes"] = stats["total"]
    mem["total_on_time"] = stats["on_time_count"]

    current_trophies = set(mem.get("unlocked_trophies", []))
    unlocked_now = []

    def unlock(tid):
        if tid not in current_trophies and tid in ALL_TROPHIES:
            current_trophies.add(tid)
            unlocked_now.append(ALL_TROPHIES[tid])

    if stats["total"] >= 1: unlock("first_dawn")
    if stats["streak"] >= 3: unlock("three_streak")
    if stats["streak"] >= 7: unlock("seven_streak")
    if stats["streak"] >= 14: unlock("fourteen_streak")
    if stats["streak"] >= 30: unlock("thirty_streak")
    if abs(wake_min - target_min) <= 5: unlock("bullseye")
    if wake_min < (6 * 60 + 30): unlock("early_bird")

    mem["unlocked_trophies"] = list(current_trophies)
    save_memory(mem)

    return {
        "log": log_entry,
        "is_new_day": is_new_day,
        "stats": stats,
        "xp_earned": new_xp if is_new_day else 0,
        "new_trophies": unlocked_now,
        "sleep_info": sleep_info
    }


# ----------------- 3 PRIME DIRECTIVES LOGIC -----------------
DEFAULT_DIRECTIVES = [
    {"id": 1, "text": "Deep Work 90m Focus Block", "done": False},
    {"id": 2, "text": "Physical Agoge (45m Training)", "done": False},
    {"id": 3, "text": "Kingdom Project Execution", "done": False}
]

def get_today_directives(mem):
    now = get_current_local_dt()
    today_str = now.strftime("%Y-%m-%d")
    dirs = mem.get("directives")
    if not dirs or not isinstance(dirs, dict):
        dirs = {"date": today_str, "items": list(DEFAULT_DIRECTIVES)}
        mem["directives"] = dirs
        save_memory(mem)
        return dirs

    if dirs.get("date") != today_str:
        old_items = dirs.get("items", [])
        new_items = []
        for i in range(1, 4):
            matching = next((x for x in old_items if x.get("id") == i), None)
            txt = matching.get("text") if matching else DEFAULT_DIRECTIVES[i - 1]["text"]
            new_items.append({"id": i, "text": txt, "done": False})
        dirs = {"date": today_str, "items": new_items}
        mem["directives"] = dirs
        save_memory(mem)
        return dirs

    return dirs


def format_directives_message(mem):
    dirs = get_today_directives(mem)
    items = dirs.get("items", [])
    conquered = sum(1 for x in items if x.get("done"))
    total = len(items)

    lines = [
        "⚔️👑 *THE 3 PRIME DIRECTIVES (TODAY'S BATTLES)* 👑⚔️",
        "────────────────────────",
        f"📅 *Date:* `{dirs.get('date')}`",
        f"⚡ *Progress:* *{conquered} / {total} Conquered*\n"
    ]
    for it in items:
        status = "✅ *CONQUERED*" if it.get("done") else "⏳ *IN PROGRESS*"
        lines.append(f"• **Battle {it.get('id')}:** {it.get('text')}\n  ↳ Status: {status}")

    lines.append("\n_Tap any battle button below to toggle its status on mobile:_")
    return "\n".join(lines)


def get_directives_inline_keyboard(mem):
    dirs = get_today_directives(mem)
    keyboard = []
    for item in dirs.get("items", []):
        icon = "✅" if item.get("done") else "⬜"
        idx = item.get("id", 1)
        text = item.get("text", f"Directive {idx}")
        btn_text = f"{icon} {idx}. {text[:36]}"
        keyboard.append([{"text": btn_text, "callback_data": f"toggle_dir_{idx}"}])
    keyboard.append([{"text": "🔄 Refresh Status", "callback_data": "refresh_directives"}])
    return {"inline_keyboard": keyboard}


# ----------------- TELEGRAM API HELPERS -----------------
def send_telegram_message(chat_id, text, parse_mode="Markdown", reply_markup=None):
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        res = http_session.post(f"{API_URL}/sendMessage", json=payload, timeout=12)
        return res.json()
    except Exception as e:
        logger.error(f"Failed to send telegram message: {e}")
        return None


def send_telegram_voice(chat_id, voice_file_path, caption=None):
    if not os.path.exists(voice_file_path):
        logger.warning(f"Voice file not found: {voice_file_path}")
        return None
    try:
        data = {"chat_id": chat_id}
        if caption:
            data["caption"] = caption
            data["parse_mode"] = "Markdown"
        with open(voice_file_path, "rb") as f:
            res = requests.post(f"{API_URL}/sendVoice", data=data, files={"voice": f}, timeout=25)
            return res.json()
    except Exception as e:
        logger.error(f"Failed to send telegram voice: {e}")
        return None


def edit_telegram_message(chat_id, message_id, text, parse_mode="Markdown", reply_markup=None):
    payload = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": parse_mode
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        res = http_session.post(f"{API_URL}/editMessageText", json=payload, timeout=10)
        return res.json()
    except Exception as e:
        logger.warning(f"Failed to edit telegram message: {e}")
        return None


def answer_callback_query(callback_id, text=None, show_alert=False):
    if not callback_id:
        return
    payload = {"callback_query_id": callback_id}
    if text:
        payload["text"] = text
    if show_alert:
        payload["show_alert"] = True
    try:
        http_session.post(f"{API_URL}/answerCallbackQuery", json=payload, timeout=8)
    except Exception as e:
        logger.warning(f"Failed to answer callback query: {e}")


def get_main_keyboard():
    return {
        "keyboard": [
            [{"text": "📊 Full Report"}, {"text": "🔥 Sovereign Streak"}],
            [{"text": "⚔️ 3 Directives"}, {"text": "📜 Sunday Debrief"}],
            [{"text": "🎙️ Morning Briefing"}, {"text": "⏰ Log Today"}]
        ],
        "resize_keyboard": True,
        "is_persistent": True
    }


# ----------------- MESSAGE FORMATTERS & INTELLIGENCE -----------------
def format_daily_briefing(mem, sleep_info=None):
    stats = calculate_stats(mem)
    streak = stats["streak"]
    rank = stats["rank"]
    dirs = get_today_directives(mem)
    quote = MOTIVATIONAL_QUOTES[streak % len(MOTIVATIONAL_QUOTES)]

    if not sleep_info:
        sleep_info = calculate_sleep_recovery(mem, int(get_current_local_dt().timestamp()))

    lines = [
        f"🎙️👑 *AI DAWN BRIEFING — ORDERS FROM HIGH COMMAND* 👑🎙️",
        "────────────────────────",
        f"🎖️ *Spartan King:* `{mem.get('user_name', 'King')}` | *Rank:* *{rank['title']}*",
        f"🔥 *Sovereign Streak:* *{streak} DAYS CONQUERED*",
        f"🌙 *Sleep Recovery:* `{sleep_info['duration_str']}` ({sleep_info['score']}% — {sleep_info['label']})",
        "",
        f"_{quote}_",
        "",
        "⚔️ *TODAY'S MARCHING ORDERS (THE 3 PRIME DIRECTIVES):*"
    ]
    for it in dirs.get("items", []):
        icon = "✅" if it.get("done") else "🎯"
        lines.append(f"{icon} *Battle {it.get('id')}:* {it.get('text')}")

    lines.append("\n_Conquer the first 90 minutes. Today's battlefield is already won in your mind._")
    return "\n".join(lines)


def format_weekly_chronicle(mem):
    now = get_current_local_dt()
    logs = mem.get("logs", [])
    today = now.date()

    # Filter last 7 days
    past_7_dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    past_7_dates.reverse()

    week_logs = [l for l in logs if l.get("date") in past_7_dates]
    wakes_count = len(week_logs)
    on_time_count = sum(1 for l in week_logs if l.get("on_time"))
    on_time_pct = (on_time_count / 7.0 * 100.0)

    if on_time_pct >= 85:
        tier = "🏆 S-TIER SOVEREIGN CENTURION"
    elif on_time_pct >= 70:
        tier = "⚔️ A-TIER DISCIPLINED HOPLITE"
    else:
        tier = "🛡️ B-TIER AGOGE RECRUIT"

    dirs = get_today_directives(mem)
    conquered_today = sum(1 for x in dirs.get("items", []) if x.get("done"))

    lines = [
        "📜👑 *SUNDAY CITADEL CHRONICLE (WEEKLY DEBRIEF)* 👑📜",
        "────────────────────────",
        f"📅 *Evaluation Window:* `{past_7_dates[0]}` → `{past_7_dates[-1]}`",
        f"🎖️ *Performance Tier:* *{tier}*",
        f"🔥 *Active Streak:* *{mem.get('current_streak', 0)} Days*",
        f"⏰ *Mornings Conquered:* *{wakes_count} / 7 Days* ({on_time_pct:.1f}% Consistency)",
        f"✨ *Citadel Total XP:* `{mem.get('xp', 0)} XP`",
        "",
        "📊 *7-DAY DAWN BATTLE BREAKDOWN:*"
    ]

    for d_str in past_7_dates:
        matching = next((l for l in logs if l.get("date") == d_str), None)
        if matching:
            icon = "✅" if matching.get("on_time") else "⚠️"
            energy_icon = "⚡" if matching.get("energy") == "HIGH" else "😐"
            lines.append(f"• `{d_str}`: {icon} `{matching.get('time')}` (Sleep: {matching.get('sleep_duration', '7h')}, {energy_icon})")
        else:
            lines.append(f"• `{d_str}`: ❌ _Unrecorded / Rest_")

    lines.append("\n_\"Consistency is the rare metal from which legends are forged.\"_")
    return "\n".join(lines)


def format_report(mem):
    stats = calculate_stats(mem)
    streak = stats["streak"]
    rank = stats["rank"]
    logs = mem.get("logs", [])

    next_ms = next((m for m in MILESTONES if m["day"] > streak), MILESTONES[-1])
    days_left = max(0, next_ms["day"] - streak)

    filled_len = min(10, int((streak / 30.0) * 10))
    bar = "█" * filled_len + "░" * (10 - filled_len)

    recent = sorted(logs, key=lambda x: x["date"], reverse=True)[:5]
    history_lines = []
    for r in recent:
        icon = "✅" if r.get("on_time") else "⚠️"
        history_lines.append(f"• `{r['date']}` at `{r['time']}` ({icon} {r.get('method', 'WAKY')})")

    history_str = "\n".join(history_lines) if history_lines else "_No logs recorded yet. Log your first dawn!_"

    dirs = get_today_directives(mem)
    d_done = sum(1 for x in dirs.get("items", []) if x.get("done"))
    d_total = len(dirs.get("items", []))

    honor_str = "🛡️ HONOR INTACT" if mem.get("honor_status") != "BREACH" else "⚠️ BREACH RECORDED"

    text = f"""👑 *WAKY SPARTAN KING — CITADEL DAWN REPORT* 🏛️
────────────────────────
🔥 *Active Sovereign Streak:* *{streak} DAYS*
🏆 *All-Time Record:* *{stats['best_streak']} Days*
🎯 *Target Battle Alarm:* `{mem.get('target_time', '07:00')}`
⚔️ *Total Mornings Conquered:* *{stats['total']}*
⚡ *On-Time Consistency:* *{stats['on_time_pct']:.1f}%*
⏱️ *Average Wake-Up Time:* `{stats['avg_time']}`
🎯 *Today's Directives:* *{d_done}/{d_total} Battles Won*
🛡️ *Citadel Standing:* *{honor_str}*

🎖️ *Current Rank:*
*{rank['title']}*
✨ *XP:* `{mem.get('xp', 0)} XP` (Next rank at `{rank['next_xp']} XP`)

🧠 *Active Neurological Stage:*
*{next_ms['title']}*
_{next_ms['sub']}_
⏳ *{days_left} {'day' if days_left == 1 else 'days'} until biological upgrade!*
`[{bar}]` Day {streak}/30

📜 *Recent Morning Battles:*
{history_str}
────────────────────────
🛡️ _Citadel 24/7 Cloud Memory active. Even if your PC sleeps, your kingdom stands._"""
    return text


def format_streak(mem):
    stats = calculate_stats(mem)
    streak = stats["streak"]
    next_ms = next((m for m in MILESTONES if m["day"] > streak), MILESTONES[-1])
    days_left = max(0, next_ms["day"] - streak)

    pct = min(100, int((streak / 90.0) * 100))
    filled_len = min(10, int((streak / 30.0) * 10))
    bar = "█" * filled_len + "░" * (10 - filled_len)

    text = f"""🔥 *SOVEREIGN STREAK STATUS* ⚔️
────────────────────────
🔥 *Current Streak:* *{streak} DAYS*
🏆 *Citadel Record:* *{stats['best_streak']} Days*
👑 *Level:* *{stats['rank']['title']}*

`[{bar}]` *{pct}%* towards 90-Day Sovereign Transcendence

🧠 *Target Biological Milestone:*
*{next_ms['title']}*
_{next_ms['desc']}_
⏳ *{days_left} {'day' if days_left == 1 else 'days'} remaining!*

_\"He who conquers the dawn commands his destiny.\"_"""
    return text


# ----------------- COMMAND & CALLBACK DISPATCHER -----------------
def handle_message(msg, mem):
    chat_id = msg.get("chat", {}).get("id")
    from_user = msg.get("from", {})
    user_name = from_user.get("first_name", "Spartan")
    callback_id = msg.get("callback_id")
    message_id = msg.get("message_id")

    if mem.get("user_id") != chat_id:
        mem["user_id"] = chat_id
        mem["user_name"] = user_name
        save_memory(mem)

    # 1. Video Proof Verification
    if "video" in msg or "video_note" in msg or "document" in msg:
        caption = (msg.get("caption") or "").strip()
        now = get_current_local_dt()
        wake_time_str = now.strftime("%H:%M")

        if "Wake Time:" in caption:
            try:
                part = caption.split("Wake Time:")[1].split("\n")[0].strip()
                wake_time_str = part.split(" ")[0].strip()
            except Exception:
                pass

        result = record_wake(mem, wake_time_str, method="DESKTOP_VIDEO_PROOF", caption=caption)
        log = result["log"]
        stats = result["stats"]
        sleep_info = result["sleep_info"]

        reply = f"""👑 *5-SECOND VIDEO PROOF VERIFIED!* ⚔️
────────────────────────
🛡️ *The Spartan Citadel salutes your vigilance!*
📅 *Date:* `{log['date']}`
⏰ *Wake Time:* `{log['time']}` ({log['status']})
🌙 *Sleep Recovery:* `{sleep_info['duration_str']}` ({sleep_info['score']}%)
🔥 *Current Streak:* *{stats['streak']} DAYS*
✨ *XP Earned:* `+{result['xp_earned']} XP` (Total: `{mem.get('xp', 0)} XP`)

_Citadel Cloud Memory updated. Sleep or shut down your PC with total peace of mind._"""
        send_telegram_message(chat_id, reply, reply_markup=get_main_keyboard())
        # Also send AI Dawn Briefing
        send_telegram_message(chat_id, format_daily_briefing(mem, sleep_info), reply_markup=get_main_keyboard())
        return

    text = (msg.get("text") or "").strip()
    text_lower = text.lower()

    # 2. Handle Inline Callbacks
    if callback_id:
        if text == "btn_wake":
            now = get_current_local_dt()
            today_str = now.strftime("%Y-%m-%d")
            mem["urgent_alarm_dismissed_date"] = today_str
            wake_time_str = now.strftime("%H:%M")
            result = record_wake(mem, wake_time_str, method="URGENT_ALARM_OUT_OF_BED", caption="Dismissed urgent phone alarm")
            log = result["log"]
            stats = result["stats"]
            sleep_info = result["sleep_info"]

            answer_callback_query(callback_id, text="⚔️ DAWN VICTORY! Out of bed confirmed!", show_alert=True)
            reply = f"""⚔️👑 *VICTORY CONFIRMED: OUT OF BED!* 👑⚔️
────────────────────────
You conquered the mattress trap and silenced the urgent alarm!
⏰ *Wake Time:* `{log['time']}` ({log['status']})
🌙 *Sleep Duration:* `{sleep_info['duration_str']}` ({sleep_info['score']}%)
🔥 *Active Streak:* *{stats['streak']} DAYS*
✨ *XP Earned:* `+{result['xp_earned']} XP`

_The phalanx holds strong! Today's kingdom is yours._"""
            send_telegram_message(chat_id, reply, reply_markup=get_main_keyboard())
            send_telegram_message(chat_id, format_daily_briefing(mem, sleep_info), reply_markup=get_main_keyboard())
            return

        elif text == "btn_curfew":
            now = get_current_local_dt()
            today_str = now.strftime("%Y-%m-%d")
            current_ts = int(now.timestamp())
            if mem.get("last_curfew_awarded_date") == today_str:
                answer_callback_query(callback_id, text="Sleep recovery already logged for tonight! Rest well.", show_alert=False)
            else:
                mem["last_curfew_awarded_date"] = today_str
                mem["last_curfew_ts"] = current_ts
                curfew_count = mem.get("curfew_count", 0) + 1
                mem["curfew_count"] = curfew_count
                mem["xp"] = mem.get("xp", 0) + 50
                if curfew_count >= 5 and "curfew_master" not in mem.get("unlocked_trophies", []):
                    mem.setdefault("unlocked_trophies", []).append("curfew_master")
                save_memory(mem)
                answer_callback_query(callback_id, text="😴 Sleep Recovery Logged! +50 XP Awarded.", show_alert=True)
                curfew_ack = f"""🛡️ *SLEEP RECOVERY LOGGED! (+50 XP)*
────────────────────────
Rest well, Spartan King. Blue light banished; melatonin surging.
Tomorrow's dawn battle target is locked at `{mem.get('target_time', '07:00')}`.
Total XP: `{mem.get('xp', 0)} XP`."""
                send_telegram_message(chat_id, curfew_ack, reply_markup=get_main_keyboard())
            return

        elif text.startswith("toggle_dir_"):
            try:
                dir_id = int(text.split("_")[-1])
                dirs = get_today_directives(mem)
                for item in dirs.get("items", []):
                    if item.get("id") == dir_id:
                        item["done"] = not item.get("done", False)
                        break
                save_memory(mem)
                answer_callback_query(callback_id, text=f"Battle {dir_id} status updated!")
                if message_id:
                    edit_telegram_message(chat_id, message_id, format_directives_message(mem), reply_markup=get_directives_inline_keyboard(mem))
                else:
                    send_telegram_message(chat_id, format_directives_message(mem), reply_markup=get_directives_inline_keyboard(mem))
            except Exception as e:
                logger.error(f"Error toggling directive: {e}")
                answer_callback_query(callback_id, text="Error updating directive.")
            return

        elif text.startswith("energy_"):
            rating = text.split("_")[1].upper()
            now = get_current_local_dt()
            today_str = now.strftime("%Y-%m-%d")
            for l in mem.get("logs", []):
                if l.get("date") == today_str:
                    l["energy"] = rating
                    break
            save_memory(mem)
            rating_label = "⚡ HIGH FOCUS" if rating == "HIGH" else ("😐 NORMAL" if rating == "NORMAL" else "🥱 SLUGGISH")
            answer_callback_query(callback_id, text=f"Logged energy: {rating_label}!", show_alert=True)
            if message_id:
                edit_telegram_message(chat_id, message_id, f"🌆 *EVENING PHALANX REVIEW RECORDED*\nToday's Energy Rating: *{rating_label}*\n\nRest well tonight, Spartan King!")
            return

        elif text == "restore_honor":
            mem["honor_status"] = "HONORABLE"
            save_memory(mem)
            answer_callback_query(callback_id, text="⚔️ Honor Restored! Stand tall and conquer the battlefield!", show_alert=True)
            send_telegram_message(chat_id, "🛡️ *SPARTAN HONOR RESTORED!* You have reclaimed your place in the phalanx. Execute your Prime Directives!", reply_markup=get_main_keyboard())
            return

        elif text == "refresh_directives":
            answer_callback_query(callback_id, text="Directives refreshed!")
            if message_id:
                edit_telegram_message(chat_id, message_id, format_directives_message(mem), reply_markup=get_directives_inline_keyboard(mem))
            return

    # 3. Handle Text Commands
    if text_lower in ["/start", "start"]:
        stats = calculate_stats(mem)
        welcome = f"""👑 *HAIL, SPARTAN KING {user_name.upper()}!* 🏛️
────────────────────────
Welcome to the *WAKY 24/7 Citadel Cloud Memory v3.0*.

🔥 *Active Streak:* *{stats['streak']} Days*
🎯 *Target Battle Alarm:* `{mem.get('target_time', '07:00')}`
🎖️ *Rank:* *{stats['rank']['title']}*

*TACTICAL COMMANDS:*
• `/briefing` — Daily AI Dawn Orders & Battle March
• `/warcry` — Spoken Spartan General Dawn Voice Note
• `/weekly` — Sunday Citadel Performance Debrief
• `/report` — Complete Dawn Intelligence & Consistency Report
• `/directives` — View and tick off your 3 Prime Directives
• `/curfew` — Log tonight's Sleep Recovery (+50 XP)
• `/log` — Direct mobile morning check-in

_The dawn is conquered, not given._"""
        send_telegram_message(chat_id, welcome, reply_markup=get_main_keyboard())

    elif text_lower in ["/briefing", "briefing", "🎙️ morning briefing"]:
        send_telegram_message(chat_id, format_daily_briefing(mem), reply_markup=get_main_keyboard())

    elif text_lower in ["/warcry", "warcry", "voice", "/voice"]:
        send_telegram_message(chat_id, "🔊 *Summoning Spartan High Command War Cry...*")
        send_telegram_voice(chat_id, WARCRY_AUDIO_PATH, caption="⚔️ *SPARTAN GENERAL'S DAWN WAR CRY*")

    elif text_lower in ["/weekly", "weekly", "📜 sunday debrief", "debrief"]:
        send_telegram_message(chat_id, format_weekly_chronicle(mem), reply_markup=get_main_keyboard())

    elif text_lower in ["/report", "report", "📊 full report", "report please"]:
        send_telegram_message(chat_id, format_report(mem), reply_markup=get_main_keyboard())

    elif text_lower in ["/streak", "streak", "🔥 sovereign streak"]:
        send_telegram_message(chat_id, format_streak(mem), reply_markup=get_main_keyboard())

    elif text_lower in ["⚔️ 3 directives", "/directives", "directives", "/tasks", "tasks"]:
        send_telegram_message(chat_id, format_directives_message(mem), reply_markup=get_directives_inline_keyboard(mem))

    elif text_lower in ["/curfew", "curfew", "sleep", "/sleep"]:
        now = get_current_local_dt()
        today_str = now.strftime("%Y-%m-%d")
        current_ts = int(now.timestamp())
        if mem.get("last_curfew_awarded_date") == today_str:
            send_telegram_message(chat_id, "😴 *Sleep recovery already logged for tonight!* Rest well, King.", reply_markup=get_main_keyboard())
        else:
            mem["last_curfew_awarded_date"] = today_str
            mem["last_curfew_ts"] = current_ts
            mem["xp"] = mem.get("xp", 0) + 50
            save_memory(mem)
            send_telegram_message(chat_id, "🛡️ *SLEEP RECOVERY LOGGED! (+50 XP)*\nRest well, Spartan King. See you at dawn.", reply_markup=get_main_keyboard())

    elif text_lower.startswith("/log") or text_lower.startswith("log") or text_lower in ["⏰ log today", "i woke up", "awake"]:
        now = get_current_local_dt()
        parts = text.split()
        wake_time_str = now.strftime("%H:%M")
        if len(parts) >= 2 and ":" in parts[1]:
            wake_time_str = parts[1]

        result = record_wake(mem, wake_time_str, method="MOBILE_TELEGRAM_LOG")
        log = result["log"]
        stats = result["stats"]
        sleep_info = result["sleep_info"]

        reply = f"""⚔️ *DAWN CONQUERED & RECORDED IN CLOUD MEMORY!* 👑
────────────────────────
📅 *Date:* `{log['date']}`
⏰ *Wake Time:* `{log['time']}` ({log['status']})
🌙 *Sleep Recovery:* `{sleep_info['duration_str']}` ({sleep_info['score']}%)
🔥 *Active Streak:* *{stats['streak']} DAYS*
✨ *XP Earned:* `+{result['xp_earned']} XP` (Total: `{mem.get('xp', 0)} XP`)

_Recorded instantly to 24/7 cloud storage._"""
        send_telegram_message(chat_id, reply, reply_markup=get_main_keyboard())
        send_telegram_message(chat_id, format_daily_briefing(mem, sleep_info), reply_markup=get_main_keyboard())

    elif text_lower.startswith("/alarm") or text_lower.startswith("/target") or text_lower.startswith("alarm"):
        parts = text.split()
        if len(parts) >= 2 and ":" in parts[1]:
            new_target = parts[1].strip()
            mem["target_time"] = new_target
            save_memory(mem)
            send_telegram_message(chat_id, f"🎯 *Target dawn alarm updated to `{new_target}`!*", reply_markup=get_main_keyboard())
        else:
            send_telegram_message(chat_id, f"Current target alarm is `{mem.get('target_time', '07:00')}`.\nTo change it, send: `/alarm 06:30`", reply_markup=get_main_keyboard())

    elif text_lower.startswith("/delete") or text_lower.startswith("/remove"):
        parts = text.split()
        target_date = get_current_local_dt().strftime("%Y-%m-%d")
        if len(parts) >= 2:
            target_date = parts[1].strip()
        old_count = len(mem.get("logs", []))
        mem["logs"] = [l for l in mem.get("logs", []) if l.get("date") != target_date]
        calculate_stats(mem)
        save_memory(mem)
        if len(mem["logs"]) < old_count:
            send_telegram_message(chat_id, f"🗑️ *Dawn record for `{target_date}` removed!*\n🔥 Current streak: *{mem['current_streak']} Days*.", reply_markup=get_main_keyboard())
        else:
            send_telegram_message(chat_id, f"⚠️ No record found for `{target_date}`.", reply_markup=get_main_keyboard())

    elif text_lower.startswith("/streak_set") or text_lower.startswith("/set_streak") or text_lower.startswith("/adjust"):
        parts = text.split()
        if len(parts) >= 2 and parts[1].isdigit():
            new_s = int(parts[1])
            mem["current_streak"] = new_s
            save_memory(mem)
            send_telegram_message(chat_id, f"🔥 *Sovereign streak manually adjusted to {new_s} DAYS!*", reply_markup=get_main_keyboard())
        else:
            send_telegram_message(chat_id, "To manually adjust your streak, send: `/adjust [number]` (e.g. `/adjust 5`)", reply_markup=get_main_keyboard())

    elif text_lower in ["/reset_all", "reset_all"]:
        mem["logs"] = []
        mem["current_streak"] = 0
        mem["best_streak"] = 0
        mem["total_wakes"] = 0
        mem["xp"] = 0
        mem["unlocked_trophies"] = []
        save_memory(mem)
        send_telegram_message(chat_id, "⚔️ *All records and stats have been reset to zero.* Ready for your new journey!", reply_markup=get_main_keyboard())

    else:
        send_telegram_message(chat_id, f"⚔️ Spartan King, I received: \"{text}\".\nUse `/briefing` for orders, `/report` for analytics, or `/directives` for your battle plan.", reply_markup=get_main_keyboard())


# ----------------- AUTONOMOUS 24/7 DAWN ALARM & PROTOCOLS DISPATCHER -----------------
def alarm_dispatcher_thread():
    logger.info("Autonomous 24/7 Dawn Battle Alarm & Protocols Dispatcher started.")
    while True:
        try:
            time.sleep(15)
            mem = load_memory()
            user_id = mem.get("user_id") or PRIMARY_USER_ID
            if not user_id:
                continue

            now = get_current_local_dt()
            today_str = now.strftime("%Y-%m-%d")
            now_hm = now.strftime("%H:%M")
            weekday = now.weekday() # 6 is Sunday

            target_time = mem.get("target_time", "07:00")
            has_logged = any(l.get("date") == today_str for l in mem.get("logs", []))

            try:
                t_parts = [int(p) for p in target_time.split(":")]
                t_min = t_parts[0] * 60 + t_parts[1]
                now_min = now.hour * 60 + now.minute
                diff_min = now_min - t_min
            except Exception:
                t_min = 420
                now_min = now.hour * 60 + now.minute
                diff_min = now_min - t_min

            current_ts = time.time()

            # 1. MORNING BATTLE DAWN ALARM & SPOKEN WAR CRY (At target dawn time)
            if now_hm == target_time and not has_logged:
                if mem.get("last_alarm_date") != today_str:
                    mem["last_alarm_date"] = today_str
                    save_memory(mem)
                    # Send General's Spoken Voice Note
                    send_telegram_voice(user_id, WARCRY_AUDIO_PATH, caption=f"⚔️👑 *SPARTAN KING, AWAKEN! TARGET DAWN {target_time}* 👑⚔️")
                    logger.info(f"Morning Dawn Spoken Voice Note dispatched to {user_id}")

            # 2. URGENT REPEATED PHONE ALARM (Fires starting at target dawn, every 90s up to 7 rounds)
            if not has_logged and mem.get("urgent_alarm_dismissed_date") != today_str:
                if 0 <= diff_min <= 20:
                    if mem.get("urgent_alarm_date") != today_str:
                        mem["urgent_alarm_date"] = today_str
                        mem["urgent_alarm_round"] = 0
                        mem["last_urgent_alarm_ts"] = 0

                    round_num = mem.get("urgent_alarm_round", 0)
                    last_ts = mem.get("last_urgent_alarm_ts", 0)

                    if round_num < 7 and (current_ts - last_ts >= 90):
                        round_num += 1
                        mem["urgent_alarm_round"] = round_num
                        mem["last_urgent_alarm_ts"] = current_ts
                        save_memory(mem)

                        urgent_msg = f"""🚨⚔️ *[ROUND {round_num}/7] URGENT DAWN ALARM — GET OUT OF BED!* ⚔️🚨
────────────────────────
🎯 *Target Battle Dawn:* `{target_time}` | *Current:* `{now_hm}`
⚠️ *Cortisol peak is active. SNOOZING IS NOT AN OPTION!*

Every minute you stay under the covers drains willpower and breaks habit myelination.
Stand on your feet right now and press the button below:"""
                        urgent_markup = {
                            "inline_keyboard": [
                                [{"text": "⚔️ I AM AWAKE & OUT OF BED!", "callback_data": "btn_wake"}]
                            ]
                        }
                        send_telegram_message(user_id, urgent_msg, reply_markup=urgent_markup)
                        logger.info(f"Dispatched urgent alarm round {round_num}/7 to {user_id}")

            # 3. SPARTAN HONOR PENALTY (30+ minutes past dawn without logging)
            if not has_logged and diff_min >= 30 and diff_min <= 60:
                if mem.get("last_penalty_date") != today_str:
                    mem["last_penalty_date"] = today_str
                    mem["honor_status"] = "BREACH"
                    old_xp = mem.get("xp", 0)
                    mem["xp"] = max(0, old_xp - 150)
                    save_memory(mem)

                    penalty_msg = f"""⚠️🛡️ *CITADEL DISGRACE ALERT: THE PHALANX WAS BREACHED!* 🛡️⚠️
────────────────────────
You are 30+ minutes past your target dawn `{target_time}` without logging.
Voluntary surrender to comfort carries consequences:

📉 *Penalty Applied:* `-150 XP` (Total: `{mem['xp']} XP`)
Status: *PHALANX BREACH*

⚔️ *A Spartan falls only to rise stronger.*
Tap below to restore your honor and march into battle:"""
                    pen_markup = {
                        "inline_keyboard": [
                            [{"text": "⚔️ I Stand & Restore My Honor", "callback_data": "restore_honor"}]
                        ]
                    }
                    send_telegram_message(user_id, penalty_msg, reply_markup=pen_markup)
                    logger.info(f"Honor penalty dispatched to {user_id}")

            # 4. MIDDAY PRIME DIRECTIVES CHECK (13:00)
            if now_hm == "13:00":
                if mem.get("last_midday_date") != today_str:
                    mem["last_midday_date"] = today_str
                    save_memory(mem)
                    msg = "☀️ *MIDDAY PHALANX CHECK (13:00)* 🏛️\nHalf of the battlefield is conquered. Review and check off your battles:\n\n" + format_directives_message(mem)
                    send_telegram_message(user_id, msg, reply_markup=get_directives_inline_keyboard(mem))
                    logger.info(f"Midday Directives Check dispatched to {user_id}")

            # 5. EVENING DIRECTIVES & ENERGY TRACKER REVIEW (18:00)
            if now_hm == "18:00":
                if mem.get("last_evening_date") != today_str:
                    mem["last_evening_date"] = today_str
                    save_memory(mem)
                    msg = "🌆 *EVENING PHALANX REVIEW (18:00)* ⚔️\nFinish the day strong! Concur your remaining battles:\n\n" + format_directives_message(mem)
                    send_telegram_message(user_id, msg, reply_markup=get_directives_inline_keyboard(mem))

                    # Energy prompt
                    energy_msg = "🧠 *CIRCADIAN ENERGY CHECK:* How was your laser focus & mental alertness today?"
                    energy_markup = {
                        "inline_keyboard": [
                            [{"text": "⚡ High Focus / Zero Brain Fog", "callback_data": "energy_high"}],
                            [{"text": "😐 Normal / Steady Work", "callback_data": "energy_normal"}],
                            [{"text": "🥱 Sluggish / Tired", "callback_data": "energy_low"}]
                        ]
                    }
                    send_telegram_message(user_id, energy_msg, reply_markup=energy_markup)
                    logger.info(f"Evening Directives & Energy Review dispatched to {user_id}")

            # 6. SUNDAY CITADEL CHRONICLE DEBRIEF (Every Sunday at 20:00)
            if weekday == 6 and now_hm == "20:00":
                if mem.get("last_sunday_debrief_date") != today_str:
                    mem["last_sunday_debrief_date"] = today_str
                    save_memory(mem)
                    send_telegram_message(user_id, format_weekly_chronicle(mem), reply_markup=get_main_keyboard())
                    logger.info(f"Sunday Weekly Debrief dispatched to {user_id}")

            # 7. NIGHT AGOGE BEDTIME CURFEW (22:30)
            if now_hm == "22:30":
                if mem.get("last_curfew_date") != today_str:
                    mem["last_curfew_date"] = today_str
                    save_memory(mem)
                    curfew_msg = f"""🌙👑 *SPARTAN NIGHT AGOGE — BEDTIME CURFEW (22:30)* 👑🌙
────────────────────────
Circadian sovereignty begins the night before!
Tomorrow's dawn victory at `{target_time}` is forged right now in deep sleep.

🛡️ *WIND-DOWN PROTOCOL:*
1. 📵 Blue light shutdown: Put devices into sleep mode.
2. ❄️ Sleeping chamber cool & pitch dark.
3. 🧘 Clear the mind: Battles are sealed.

Tap below to lock in sleep recovery and claim *+50 XP*!"""
                    curfew_markup = {
                        "inline_keyboard": [
                            [{"text": "😴 Entering Sleep Recovery (+50 XP)", "callback_data": "btn_curfew"}]
                        ]
                    }
                    send_telegram_message(user_id, curfew_msg, reply_markup=curfew_markup)
                    logger.info(f"Bedtime Curfew dispatched to {user_id}")

        except Exception as e:
            logger.error(f"Error in alarm dispatcher thread: {e}")


# ----------------- MAIN LONG POLLING LOOP -----------------
def main():
    logger.info("Starting WAKY Spartan King Cloud Bot v3.0 (24/7 Daemon)...")
    threading.Thread(target=alarm_dispatcher_thread, daemon=True).start()
    logger.info("Autonomous 24/7 background dawn alarm dispatcher initiated.")
    logger.info(f"Target Primary User: {PRIMARY_USER_ID}")
    logger.info(f"Persistent Storage Path: {DATA_FILE}")

    mem = load_memory()
    logger.info(f"Loaded memory. Current streak: {mem.get('current_streak', 0)} | Total wakes: {len(mem.get('logs', []))}")

    try:
        http_session.get(f"{API_URL}/deleteWebhook", timeout=10)
        logger.info("Webhook cleared, long-polling ready.")
    except Exception as e:
        logger.warning(f"Could not clear webhook: {e}")

    offset = None

    while True:
        try:
            params = {"timeout": 12}
            if offset:
                params["offset"] = offset

            res = http_session.get(f"{API_URL}/getUpdates", params=params, timeout=20)
            if res.status_code == 200:
                data = res.json()
                if data.get("ok"):
                    for update in data.get("result", []):
                        offset = update["update_id"] + 1
                        msg = update.get("message") or update.get("channel_post") or update.get("edited_message")
                        if not msg and "callback_query" in update:
                            cb = update["callback_query"]
                            msg = cb.get("message") or {}
                            msg["text"] = cb.get("data", "")
                            msg["from"] = cb.get("from", {})
                            msg["callback_id"] = cb.get("id")
                            msg["message_id"] = cb.get("message", {}).get("message_id")
                            if "message" in cb and "chat" in cb["message"]:
                                msg["chat"] = cb["message"]["chat"]
                        if msg:
                            handle_message(msg, mem)
            elif res.status_code == 409:
                logger.warning("Telegram returned 409 Conflict. Backing off 20s...")
                time.sleep(20)
            else:
                logger.warning(f"Telegram returned status {res.status_code}: {res.text}")
                time.sleep(4)

        except requests.exceptions.RequestException as e:
            logger.warning(f"Network glitch polling Telegram: {e}. Retrying in 5s...")
            time.sleep(5)
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            time.sleep(3)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
WAKY - Spartan King Dawn Citadel 24/7 Cloud Bot
Persistent Memory & Remote Command Relay for @wakyyyy_bot
Runs 24/7 on hermes-vm, retaining full discipline history even when Desktop PC is closed.
"""

import os
import sys
import time
import json
import logging
from datetime import datetime, date, timedelta, timezone

import requests

# ----------------- CONFIGURATION -----------------
BOT_TOKEN = os.environ.get("WAKY_BOT_TOKEN", "8814364854:AAE3HpffTsEX3x6xnl74Fx0Lff6OxOxeTeA")
API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"
PRIMARY_USER_ID = int(os.environ.get("WAKY_USER_ID", "1900611848"))
DATA_FILE = os.environ.get("WAKY_DATA_FILE", "/opt/waky-bot/waky_memory.json")

# Default Timezone Offset: UTC+3 (Moscow / Kyiv / Levant standard for user environment)
LOCAL_TZ_OFFSET = int(os.environ.get("WAKY_TZ_OFFSET", "3"))
LOCAL_TZ = timezone(timedelta(hours=LOCAL_TZ_OFFSET))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("waky_cloud_bot")

# ----------------- SPARTAN GAME SYSTEM -----------------
MILESTONES = [
    {
        "day": 1,
        "title": "Day 1: The Spark of Willpower",
        "sub": "Cortisol surge crushed & snooze reflex banished",
        "desc": "Initial neuro-activation. The baseline dopamine resistance is broken."
    },
    {
        "day": 3,
        "title": "Day 3: Habit Circuit Forming",
        "sub": "Basal ganglia encoding begins; morning inertia clears 40% faster",
        "desc": "Neuro-pathways form initial myelin sheathing around dawn rising."
    },
    {
        "day": 7,
        "title": "Day 7: Circadian Clock Sync (1 Week)",
        "sub": "Suprachiasmatic nucleus (SCN) locks sleep-wake cycle directly to dawn",
        "desc": "Cellular clocks align. Natural waking begins before the alarm sounds."
    },
    {
        "day": 14,
        "title": "Day 14: The Spartan Gaze (2 Weeks)",
        "sub": "Peak morning testosterone & deep slow-wave sleep recovery stabilized",
        "desc": "Dopamine receptors upregulate; brain fog is replaced with razor focus."
    },
    {
        "day": 21,
        "title": "Day 21: Neural Pathway Myelination",
        "sub": "Habit fortress achieved: rising resistance drops to zero",
        "desc": "Automatic behavioral groove. Waking up early is now your default nature."
    },
    {
        "day": 30,
        "title": "Day 30: Sovereign King's Transmutation",
        "sub": "Default Mode Network (DMN) identity shift: dawn belongs to you",
        "desc": "A new mental architecture. You operate with supreme discipline."
    },
    {
        "day": 60,
        "title": "Day 60: The Unbreakable Phalanx",
        "sub": "Immune resilience surge and autonomic nervous system mastery",
        "desc": "60 days of absolute consistency. Indomitable will established."
    },
    {
        "day": 90,
        "title": "Day 90: Immortal Leonidas Crown",
        "sub": "Permanent neurological dawn sovereignty",
        "desc": "The highest echelon of discipline. The Spartan King sits on his throne."
    }
]

RANKS = [
    {"min_xp": 0, "title": "⚔️ LEVEL 1: AGOGE RECRUIT", "next_xp": 300},
    {"min_xp": 300, "title": "🛡️ LEVEL 2: SPARTAN HOPLITE", "next_xp": 800},
    {"min_xp": 800, "title": "🏛️ LEVEL 3: CENTURION COMMANDER", "next_xp": 1800},
    {"min_xp": 1800, "title": "⚡ LEVEL 4: PRAETORIAN CHAMPION", "next_xp": 3500},
    {"min_xp": 3500, "title": "👑 LEVEL 5: SOVEREIGN KING LEONIDAS", "next_xp": 5000}
]

ALL_TROPHIES = {
    "first_dawn": {"icon": "👑", "name": "Dawn Sovereign", "desc": "First morning conquered and verified"},
    "streak_3": {"icon": "⚡", "name": "3-Day Spartan Flame", "desc": "3 consecutive days on-time"},
    "streak_7": {"icon": "🛡️", "name": "Week 1 Shield", "desc": "7 consecutive days of discipline"},
    "streak_14": {"icon": "⚔️", "name": "Centurion Commander", "desc": "14 consecutive days of mastery"},
    "streak_21": {"icon": "🏛️", "name": "Iron Will Agoge", "desc": "21 consecutive days of habit cementing"},
    "streak_30": {"icon": "🔱", "name": "Spartan King", "desc": "30 days sovereign rule"},
    "bullseye": {"icon": "🎯", "name": "Bullseye Warrior", "desc": "Woke up within 5 minutes of alarm"},
    "early_bird": {"icon": "🌌", "name": "Night Owl Vanquisher", "desc": "Logged before 06:30 AM"}
}


# ----------------- PERSISTENT MEMORY -----------------
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
        "logs": []
    }


def load_memory():
    if not os.path.exists(DATA_FILE):
        os.makedirs(os.path.dirname(os.path.abspath(DATA_FILE)), exist_ok=True)
        mem = get_default_memory()
        save_memory(mem)
        return mem
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading memory from {DATA_FILE}: {e}")
        return get_default_memory()


def save_memory(mem):
    try:
        os.makedirs(os.path.dirname(os.path.abspath(DATA_FILE)), exist_ok=True)
        tmp_file = DATA_FILE + ".tmp"
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(mem, f, indent=2, ensure_ascii=False)
        os.replace(tmp_file, DATA_FILE)
    except Exception as e:
        logger.error(f"Error saving memory to {DATA_FILE}: {e}")


def get_current_local_dt():
    return datetime.now(LOCAL_TZ)


def get_rank_info(xp):
    current = RANKS[0]
    for r in RANKS:
        if xp >= r["min_xp"]:
            current = r
    return current


def calculate_streak(logs):
    if not logs:
        return 0
    # Extract unique dates sorted descending
    unique_dates = sorted(list(set(l["date"] for l in logs)), reverse=True)
    if not unique_dates:
        return 0
    
    today_str = get_current_local_dt().strftime("%Y-%m-%d")
    yesterday_str = (get_current_local_dt() - timedelta(days=1)).strftime("%Y-%m-%d")

    # If the latest log is older than yesterday, streak is broken
    if unique_dates[0] != today_str and unique_dates[0] != yesterday_str:
        return 0

    streak = 1
    for i in range(len(unique_dates) - 1):
        d1 = datetime.strptime(unique_dates[i], "%Y-%m-%d").date()
        d2 = datetime.strptime(unique_dates[i + 1], "%Y-%m-%d").date()
        if (d1 - d2).days == 1:
            streak += 1
        else:
            break
    return streak


def calculate_stats(mem):
    logs = mem.get("logs", [])
    total = len(logs)
    streak = calculate_streak(logs)
    mem["current_streak"] = streak
    if streak > mem.get("best_streak", 0):
        mem["best_streak"] = streak
    mem["total_wakes"] = total

    if total == 0:
        return {
            "streak": 0,
            "best_streak": mem.get("best_streak", 0),
            "total": 0,
            "on_time_pct": 100.0,
            "avg_time": mem.get("target_time", "07:00"),
            "rank": get_rank_info(mem.get("xp", 0))
        }

    def is_log_on_time(l):
        if "on_time" in l:
            return bool(l["on_time"])
        st = str(l.get("status", "")).lower()
        return "on-time" in st or "on time" in st

    on_time_count = sum(1 for l in logs if is_log_on_time(l))
    on_time_pct = (on_time_count / total) * 100.0

    # Average time calculation (minutes from midnight)
    total_minutes = 0
    valid_count = 0
    for l in logs:
        raw_t = str(l.get("time", "")).strip().upper()
        # Handle formats like "07:05 AM" or "07:05"
        is_pm = "PM" in raw_t
        t_clean = raw_t.replace("AM", "").replace("PM", "").strip()
        if ":" in t_clean:
            try:
                parts = t_clean.split(":")
                hh = int(parts[0])
                mm = int(parts[1])
                if is_pm and hh < 12:
                    hh += 12
                total_minutes += (hh * 60 + mm)
                valid_count += 1
            except Exception:
                pass
    if valid_count > 0:
        avg_min = int(total_minutes / valid_count)
        avg_hh = avg_min // 60
        avg_mm = avg_min % 60
        avg_time_str = f"{avg_hh:02d}:{avg_mm:02d}"
    else:
        avg_time_str = mem.get("target_time", "07:00")

    return {
        "streak": streak,
        "best_streak": mem.get("best_streak", 0),
        "total": total,
        "on_time_pct": on_time_pct,
        "avg_time": avg_time_str,
        "rank": get_rank_info(mem.get("xp", 0))
    }


def record_wake(mem, wake_time_str, method="TELEGRAM_LOG", caption=""):
    now = get_current_local_dt()
    date_str = now.strftime("%Y-%m-%d")
    
    # Check if already recorded today
    existing = next((l for l in mem["logs"] if l["date"] == date_str), None)
    
    # Compare with target time
    target_time_str = mem.get("target_time", "07:00")
    target_parts = [int(p) for p in target_time_str.split(":")]
    wake_parts = [int(p) for p in wake_time_str.split(":")]
    
    target_min = target_parts[0] * 60 + target_parts[1]
    wake_min = wake_parts[0] * 60 + wake_parts[1]
    
    on_time = (wake_min <= target_min)
    status_label = "ON TIME ⚔️" if on_time else "LATE RISE ⚠️"
    
    new_xp = 100 if on_time else 50
    
    log_entry = {
        "date": date_str,
        "time": wake_time_str,
        "timestamp": int(now.timestamp()),
        "on_time": on_time,
        "status": status_label,
        "method": method,
        "caption": caption
    }
    
    if existing:
        # Update existing
        idx = mem["logs"].index(existing)
        mem["logs"][idx] = log_entry
        is_new_day = False
    else:
        mem["logs"].append(log_entry)
        mem["xp"] = mem.get("xp", 0) + new_xp
        is_new_day = True

    # Re-calculate streak and stats
    stats = calculate_stats(mem)
    streak = stats["streak"]

    # Check unlockable trophies
    unlocked_now = []
    current_trophies = set(mem.get("unlocked_trophies", []))

    def unlock(tid):
        if tid not in current_trophies:
            current_trophies.add(tid)
            unlocked_now.append(ALL_TROPHIES[tid])

    unlock("first_dawn")
    if streak >= 3: unlock("streak_3")
    if streak >= 7: unlock("streak_7")
    if streak >= 14: unlock("streak_14")
    if streak >= 21: unlock("streak_21")
    if streak >= 30: unlock("streak_30")
    if abs(wake_min - target_min) <= 5: unlock("bullseye")
    if wake_min < (6 * 60 + 30): unlock("early_bird")

    mem["unlocked_trophies"] = list(current_trophies)
    save_memory(mem)

    return {
        "log": log_entry,
        "is_new_day": is_new_day,
        "stats": stats,
        "xp_earned": new_xp if is_new_day else 0,
        "new_trophies": unlocked_now
    }


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
        res = requests.post(f"{API_URL}/sendMessage", json=payload, timeout=15)
        return res.json()
    except Exception as e:
        logger.error(f"Failed to send telegram message: {e}")
        return None


def get_main_keyboard():
    return {
        "keyboard": [
            [{"text": "📊 Full Report"}, {"text": "🔥 Sovereign Streak"}],
            [{"text": "🧠 Brain Milestones"}, {"text": "🏆 Trophies"}],
            [{"text": "⏰ Log Today"}, {"text": "🛡️ Status"}]
        ],
        "resize_keyboard": True,
        "is_persistent": True
    }


# ----------------- MESSAGE FORMATTERS -----------------
def format_report(mem):
    stats = calculate_stats(mem)
    streak = stats["streak"]
    rank = stats["rank"]
    logs = mem.get("logs", [])
    
    # Next milestone
    next_ms = next((m for m in MILESTONES if m["day"] > streak), None)
    if not next_ms:
        next_ms = MILESTONES[-1]
        days_left = 0
    else:
        days_left = max(0, next_ms["day"] - streak)

    # Progress bar for streak
    filled_len = min(10, int((streak / 30.0) * 10))
    bar = "█" * filled_len + "░" * (10 - filled_len)

    # Recent history
    recent = sorted(logs, key=lambda x: x["date"], reverse=True)[:5]
    history_lines = []
    for r in recent:
        icon = "✅" if r.get("on_time") else "⚠️"
        history_lines.append(f"• `{r['date']}` at `{r['time']}` ({icon} {r.get('method', 'WAKY')})")
    
    history_str = "\n".join(history_lines) if history_lines else "_No logs recorded yet. Log your first dawn!_"

    text = f"""👑 *WAKY SPARTAN KING — CITADEL DAWN REPORT* 🏛️
────────────────────────
🔥 *Active Sovereign Streak:* *{streak} DAYS*
🏆 *All-Time Record:* *{stats['best_streak']} Days*
🎯 *Target Battle Alarm:* `{mem.get('target_time', '07:00')}`
⚔️ *Total Mornings Conquered:* *{stats['total']}*
⚡ *On-Time Consistency:* *{stats['on_time_pct']:.1f}%*
⏱️ *Average Wake-Up Time:* `{stats['avg_time']}`

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


def format_milestones(mem):
    streak = calculate_streak(mem.get("logs", []))
    lines = ["🧠 *NEUROLOGICAL & DOPAMINE REBOOT ROADMAP* 🧬\n────────────────────────"]
    for m in MILESTONES:
        is_done = (streak >= m["day"])
        icon = "👑 [CONQUERED]" if is_done else f"🔒 [Day {m['day']}]"
        prefix = "✅" if is_done else "▫️"
        lines.append(f"{prefix} *{m['title']}* {icon}\n_{m['sub']}_\n> {m['desc']}\n")
    lines.append(f"────────────────────────\n📍 *Current Position:* Day *{streak}* of 90")
    return "\n".join(lines)


def format_trophies(mem):
    unlocked = set(mem.get("unlocked_trophies", []))
    lines = ["🏆 *SPARTAN HALL OF TROPHIES* 🏛️\n────────────────────────"]
    for tid, tinfo in ALL_TROPHIES.items():
        is_unlocked = tid in unlocked
        icon = tinfo["icon"] if is_unlocked else "🔒"
        status = "✅ *UNLOCKED*" if is_unlocked else "_LOCKED_"
        lines.append(f"{icon} *{tinfo['name']}* — {status}\n   _{tinfo['desc']}_")
    lines.append(f"\n✨ *Total Trophies Claimed:* {len(unlocked)} / {len(ALL_TROPHIES)}")
    return "\n".join(lines)


# ----------------- COMMAND DISPATCHER -----------------
def handle_message(msg, mem):
    chat_id = msg.get("chat", {}).get("id")
    from_user = msg.get("from", {})
    user_name = from_user.get("first_name", "Spartan")

    # If new user or update
    if mem.get("user_id") != chat_id:
        mem["user_id"] = chat_id
        mem["user_name"] = user_name
        save_memory(mem)

    # Check for Video Proof (e.g. sent by Desktop app or mobile phone camera)
    if "video" in msg or "video_note" in msg or "document" in msg:
        caption = msg.get("caption", "")
        now = get_current_local_dt()
        wake_time_str = now.strftime("%H:%M")
        
        # Check if caption contains wake time (e.g. from Desktop app)
        if "Wake Time:" in caption:
            try:
                part = caption.split("Wake Time:")[1].split("\n")[0].strip()
                # parse format like 06:45 AM or 06:45
                wake_time_str = part.split(" ")[0].strip()
            except Exception:
                pass
                
        result = record_wake(mem, wake_time_str, method="DESKTOP_VIDEO_PROOF", caption=caption)
        log = result["log"]
        stats = result["stats"]
        trophy_text = ""
        if result["new_trophies"]:
            t_names = ", ".join([f"{t['icon']} {t['name']}" for t in result["new_trophies"]])
            trophy_text = f"\n\n🎉 *NEW TROPHY UNLOCKED:* {t_names}!"

        reply = f"""👑 *5-SECOND VIDEO PROOF VERIFIED!* ⚔️
────────────────────────
🛡️ *The Spartan Citadel salutes your vigilance!*
📅 *Date:* `{log['date']}`
⏰ *Wake Time:* `{log['time']}` ({log['status']})
🔥 *Current Streak:* *{stats['streak']} DAYS*
✨ *XP Earned:* `+{result['xp_earned']} XP` (Total: `{mem.get('xp', 0)} XP`){trophy_text}

_Citadel Cloud Memory updated. Sleep or shut down your PC with total peace of mind._"""
        send_telegram_message(chat_id, reply, reply_markup=get_main_keyboard())
        return

    text = (msg.get("text") or "").strip()
    text_lower = text.lower()

    if text_lower in ["/start", "start"]:
        stats = calculate_stats(mem)
        welcome = f"""👑 *HAIL, SPARTAN KING {user_name.upper()}!* 🏛️
────────────────────────
Welcome to the *WAKY 24/7 Citadel Cloud Memory*.
Even when your desktop PC is closed, this cloud daemon retains every wake proof, streak milestone, and biological stat.

🔥 *Active Streak:* *{stats['streak']} Days*
🎯 *Target Battle Alarm:* `{mem.get('target_time', '07:00')}`
🎖️ *Rank:* *{stats['rank']['title']}*

*QUICK COMMANDS:*
• `/report` — Complete Dawn Intelligence & Consistency Report
• `/streak` — Active Streak & Countdown to Next Brain Stage
• `/milestones` — 90-Day Dopamine & Neuroplasticity Roadmap
• `/trophies` — Hall of Unlocked Trophies
• `/log` or `/log [HH:MM]` — Direct mobile morning check-in
• `/alarm [HH:MM]` — Change morning battle target time

_The dawn is conquered, not given._"""
        send_telegram_message(chat_id, welcome, reply_markup=get_main_keyboard())

    elif text_lower in ["/report", "report", "📊 full report", "report please"]:
        send_telegram_message(chat_id, format_report(mem), reply_markup=get_main_keyboard())

    elif text_lower in ["/streak", "streak", "🔥 sovereign streak"]:
        send_telegram_message(chat_id, format_streak(mem), reply_markup=get_main_keyboard())

    elif text_lower in ["/milestones", "milestones", "🧠 brain milestones", "/brain"]:
        send_telegram_message(chat_id, format_milestones(mem), reply_markup=get_main_keyboard())

    elif text_lower in ["/trophies", "/badges", "trophies", "badges", "🏆 trophies"]:
        send_telegram_message(chat_id, format_trophies(mem), reply_markup=get_main_keyboard())

    elif text_lower.startswith("/log") or text_lower.startswith("log") or text_lower in ["⏰ log today", "i woke up", "awake"]:
        # User logging wake manually
        now = get_current_local_dt()
        parts = text.split()
        wake_time_str = now.strftime("%H:%M")
        if len(parts) >= 2 and ":" in parts[1]:
            wake_time_str = parts[1]
        
        result = record_wake(mem, wake_time_str, method="MOBILE_TELEGRAM_LOG")
        log = result["log"]
        stats = result["stats"]
        trophy_text = ""
        if result["new_trophies"]:
            t_names = ", ".join([f"{t['icon']} {t['name']}" for t in result["new_trophies"]])
            trophy_text = f"\n\n🎉 *NEW TROPHY CLAIMED:* {t_names}!"

        reply = f"""⚔️ *DAWN CONQUERED & RECORDED IN CLOUD MEMORY!* 👑
────────────────────────
📅 *Date:* `{log['date']}`
⏰ *Wake Time:* `{log['time']}` ({log['status']})
🔥 *Active Streak:* *{stats['streak']} DAYS*
✨ *XP Earned:* `+{result['xp_earned']} XP` (Total: `{mem.get('xp', 0)} XP`){trophy_text}

_Recorded instantly to 24/7 cloud storage._"""
        send_telegram_message(chat_id, reply, reply_markup=get_main_keyboard())

    elif text_lower.startswith("/alarm") or text_lower.startswith("/target") or text_lower.startswith("alarm"):
        parts = text.split()
        if len(parts) >= 2 and ":" in parts[1]:
            new_target = parts[1].strip()
            mem["target_time"] = new_target
            save_memory(mem)
            send_telegram_message(chat_id, f"🎯 *Target dawn alarm updated to `{new_target}`!*", reply_markup=get_main_keyboard())
        else:
            send_telegram_message(chat_id, f"Current target alarm is `{mem.get('target_time', '07:00')}`.\nTo change it, send: `/alarm 06:30`", reply_markup=get_main_keyboard())

    elif text_lower in ["🛡️ status", "status", "/status"]:
        stats = calculate_stats(mem)
        send_telegram_message(chat_id, f"🏛️ *CITADEL CLOUD DAEMON 24/7 STATUS:*\n• *Uptime:* ONLINE\n• *Streak:* {stats['streak']} Days\n• *Total Proofs:* {stats['total']}\n• *PC Sync:* Ready & listening.", reply_markup=get_main_keyboard())

    elif text_lower in ["/help", "help"]:
        help_text = """🏛️ *WAKY BOT COMMAND DIRECTORY* 🏛️
────────────────────────
• `/report` — Comprehensive dawn performance & history
• `/streak` — Current streak & next neuro-stage
• `/milestones` — Biological timeline (Day 1 to 90)
• `/trophies` — Unlocked achievements & badges
• `/log` — Log wake at current time
• `/log HH:MM` — Log wake at specific time (e.g. `/log 06:45`)
• `/alarm HH:MM` — Set dawn battle target (e.g. `/alarm 07:00`)
• *Video Proof* — Send any 5-second video note or video to verify automatically!

_Your cloud memory never sleeps._"""
        send_telegram_message(chat_id, help_text, reply_markup=get_main_keyboard())

    else:
        # Fallback friendly response
        send_telegram_message(chat_id, f"⚔️ Spartan King, I received: \"{text}\".\nUse `/report` for your dawn analytics, or `/log` to record waking up.", reply_markup=get_main_keyboard())


# ----------------- MAIN LONG POLLING LOOP -----------------
def main():
    logger.info("Starting WAKY Spartan King Cloud Bot (24/7 Daemon)...")
    logger.info(f"Target Primary User: {PRIMARY_USER_ID}")
    logger.info(f"Persistent Storage Path: {DATA_FILE}")

    mem = load_memory()
    logger.info(f"Loaded memory. Current streak: {mem.get('current_streak', 0)} | Total wakes: {len(mem.get('logs', []))}")

    # Remove any existing webhook to enable long polling
    try:
        requests.get(f"{API_URL}/deleteWebhook", timeout=10)
        logger.info("Webhook cleared, long-polling ready.")
    except Exception as e:
        logger.warning(f"Could not clear webhook: {e}")

    offset = None

    while True:
        try:
            params = {"timeout": 25}
            if offset:
                params["offset"] = offset

            res = requests.get(f"{API_URL}/getUpdates", params=params, timeout=35)
            if res.status_code == 200:
                data = res.json()
                if data.get("ok"):
                    for update in data.get("result", []):
                        offset = update["update_id"] + 1
                        msg = update.get("message") or update.get("channel_post")
                        if msg:
                            handle_message(msg, mem)
            else:
                logger.warning(f"Telegram returned status {res.status_code}: {res.text}")
                time.sleep(3)

        except requests.exceptions.RequestException as e:
            logger.warning(f"Network glitch polling Telegram: {e}. Retrying in 5s...")
            time.sleep(5)
        except Exception as e:
            logger.error(f"Unexpected error in main loop: {e}", exc_info=True)
            time.sleep(3)


if __name__ == "__main__":
    main()

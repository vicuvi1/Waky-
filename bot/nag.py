"""Waky nag bot: messages you on Telegram if you haven't checked in by your wake-up time.

Runs 24/7 on a server, so it works while your PC is off. It needs no database and no
connection to the PC: the desktop app pins each check-in in your chat, and this bot
reads the pinned message to see whether today's is there.

Config comes from environment variables (or a .env file next to this script):
  WAKY_BOT_TOKEN   bot token from @BotFather            (required)
  WAKY_CHAT_ID     your chat id; the app shows it        (required)
  WAKY_WEEKDAY     weekday wake-up time                  default 06:30
  WAKY_WEEKEND     weekend wake-up time                  default 06:30
  WAKY_GRACE       minutes after the target that still count as on time   default 15
  WAKY_TZ          your time zone                        default Europe/Chisinau
  WAKY_NAGS        how many reminders at most            default 3
  WAKY_NAG_EVERY   minutes between reminders             default 10
  WAKY_WHY         your why, quoted in the first reminder (optional)
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "nag_state.json"


def load_env():
    env_file = HERE / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"'))


def config():
    load_env()
    return {
        "token": os.environ["WAKY_BOT_TOKEN"],
        "chat_id": int(os.environ["WAKY_CHAT_ID"]),
        "weekday": os.environ.get("WAKY_WEEKDAY", "06:30"),
        "weekend": os.environ.get("WAKY_WEEKEND", "06:30"),
        "grace": int(os.environ.get("WAKY_GRACE", 15)),
        "tz": ZoneInfo(os.environ.get("WAKY_TZ", "Europe/Chisinau")),
        "nags": int(os.environ.get("WAKY_NAGS", 3)),
        "every": int(os.environ.get("WAKY_NAG_EVERY", 10)),
        "why": os.environ.get("WAKY_WHY", ""),
    }


# ---- pure logic (tested in tests/test_nag.py) ----

def first_nag_at(day, cfg):
    hhmm = cfg["weekend"] if day.weekday() >= 5 else cfg["weekday"]
    h, m = map(int, hhmm.split(":"))
    start = datetime(day.year, day.month, day.day, h, m, tzinfo=cfg["tz"])
    return start + timedelta(minutes=cfg["grace"])


def should_nag(now, state, cfg):
    start = first_nag_at(now.date(), cfg)
    if state.get("done") or now < start or now > start + timedelta(hours=3):
        return False
    if state.get("sent", 0) >= cfg["nags"]:
        return False
    last = state.get("last")
    return last is None or now.timestamp() - last >= cfg["every"] * 60


def pinned_checkin_day(pinned, tz):
    """The date of the pinned check-in message, or None if the pin isn't a check-in."""
    if not pinned or not (pinned.get("text") or "").startswith("✅"):
        return None
    return datetime.fromtimestamp(pinned["date"], tz).date()


def streak_from(pinned):
    match = re.search(r"(\d+)-day streak", (pinned or {}).get("text") or "")
    return int(match.group(1)) if match else 0


def nag_text(n, now, streak_at_risk, why=""):
    clock = now.strftime("%H:%M")
    if n == 1:
        text = f"⏰ It's {clock} and you haven't checked in. Get up and go to your desk."
        return f"{text}\n\nRemember why: “{why}”" if why else text
    if n == 2:
        if streak_at_risk:
            return f"Still nothing. Your {streak_at_risk}-day streak ends today if you stay in bed."
        return "Still nothing. Feet on the floor, walk to the desk."
    return "Last call. Get up now. Tomorrow-you will thank you."


# ---- telegram ----

def call(token, method, **params):
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)["result"]


def load_state(today):
    try:
        state = json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        state = {}
    return state if state.get("date") == today.isoformat() else {"date": today.isoformat()}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state))


def tick(cfg):
    now = datetime.now(cfg["tz"])
    state = load_state(now.date())
    if not should_nag(now, state, cfg):
        return
    pinned = call(cfg["token"], "getChat", chat_id=cfg["chat_id"]).get("pinned_message")
    pin_day = pinned_checkin_day(pinned, cfg["tz"])
    if pin_day == now.date():
        state["done"] = True
    else:
        at_risk = streak_from(pinned) if pin_day == now.date() - timedelta(days=1) else 0
        state["sent"] = state.get("sent", 0) + 1
        state["last"] = now.timestamp()
        call(cfg["token"], "sendMessage", chat_id=cfg["chat_id"], text=nag_text(state["sent"], now, at_risk, cfg.get("why", "")))
    save_state(state)


def main():
    cfg = config()
    print(f"Waky nag bot running for chat {cfg['chat_id']} ({cfg['tz']})", flush=True)
    while True:
        try:
            tick(cfg)
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
            print(f"tick failed: {e}", file=sys.stderr, flush=True)
        time.sleep(30)


if __name__ == "__main__":
    main()

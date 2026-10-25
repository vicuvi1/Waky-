"""Waky desktop app: a small local server plus an app window.

Run it with `pythonw app/server.py` (the desktop shortcut does this). It serves the
UI on 127.0.0.1, keeps your days in data/waky.json and posts check-ins to Telegram.
"""

import argparse
import json
import logging
import logging.handlers
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from html import escape as html_escape
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent))

import game  # noqa: E402
import insights  # noqa: E402
import notify  # noqa: E402
import recap  # noqa: E402
import secrets as secrets_lib  # noqa: E402
import night  # noqa: E402
import pc_alarm  # noqa: E402
from pc_alarm import later  # noqa: E402
import stats  # noqa: E402
import telegram  # noqa: E402
import updater  # noqa: E402
from store import Store  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STATIC = Path(__file__).resolve().parent / "static"
IDLE_EXIT_SECONDS = 600
UPDATE_CHECK_SECONDS = 6 * 3600
EXIT_RESTART = 3  # The child asks the supervisor to start it again (after an update).
log = logging.getLogger("waky")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# Looks you unlock with your rank.
THEMES = {
    "dawn": {"name": "Dawn", "level": 1},
    "bronze": {"name": "Bronze", "level": 2},
    "moonlight": {"name": "Moonlight", "level": 3},
    "marble": {"name": "Gold & marble", "level": 4},
    "legend": {"name": "Legend", "level": 5},
}


def load_env(path):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


class App:
    def __init__(self, store, background=True):
        self.store = store
        self.background = background
        self.last_seen = time.time()
        self.telegram_error = None
        self.send_lock = threading.Lock()
        # Every load-change-save of the data file takes turns, so two quick changes can't overwrite each other.
        self.write_lock = threading.RLock()
        self.update_info = {"behind": 0, "changes": [], "error": None, "checkedAt": None, **updater.version()}
        self.on_restart = None  # Set by the server: stops it so the supervisor starts the new version.
        self.started_at = time.time()
        self.ringer = pc_alarm.Ringer(store.dir / "sounds")
        self.alarm = {"active": False, "test": False}
        self.pc_alarm = {"armed": False, "next": None, "error": None}
        self.manage_pc_alarm = False  # Only the real app (not tests or demos) owns the Windows task.
        self.act_key = secrets_lib.token_urlsafe(16)  # Guards the notification-button links.
        self.port = 48990
        self.notifications = False  # Only the real app shows Windows notifications.

    # ---- state ----

    def state(self):
        data = self.store.load()
        tg = data["telegram"]
        return {
            "settings": data["settings"],
            "days": data["days"],
            "rewards": data["rewards"],
            "tiers": game.TIERS,
            "sounds": {k: v["name"] for k, v in pc_alarm.SOUNDS.items()},
            "themes": THEMES,
            "insights": insights.insights(data["days"], data["nights"]),
            "recapMonths": recap.months_with_data(data["days"]),
            "spent": data["spent"][-20:],
            "stats": stats.compute(data, date.today(), now_minutes()),
            "telegram": {
                "connected": bool(tg.get("chat_id") and self.store.secrets().get("token")),
                "name": tg.get("name"),
                "bot": tg.get("bot"),
                "chatId": tg.get("chat_id"),
                "error": self.telegram_error,
            },
            "dataDir": str(self.store.dir),
            "backupDir": str(self.store.backup_dir) if self.store.backup_dir else None,
            "backupOk": self.store.backup(),
            "update": self.update_info,
            "alarm": self.alarm,
            "pcAlarm": self.pc_alarm,
            "uptime": int(time.time() - self.started_at),
        }

    # ---- days ----

    def checkin(self, body):
        now = datetime.now()
        data = self.store.load()
        key = now.date().isoformat()
        if key not in data["days"]:
            rec = {
                "time": now.strftime("%H:%M"),
                "target": stats.target_for(now.date(), data["settings"]),
                "reps": _int(body.get("reps"), 0, 0, 500),
                "mode": body.get("mode") if body.get("mode") in ("camera", "manual") else "button",
                "sent": False,
            }
            self.apply_power_ups(data, now.date(), rec)
            if data["settings"].get("stillUp"):
                rec["stillUpDue"] = (now + timedelta(minutes=data["settings"]["stillUpAfter"])).strftime("%H:%M")
                rec["stillUpWindow"] = data["settings"]["stillUpWindow"]
            data["days"][key] = rec
            self.store.save(data)
            self.send_soon()
        self.stop_alarm()
        return self.state()

    # ---- the PC alarm and the still-up check ----

    def start_alarm(self, test=False):
        data = self.store.load()
        if not test and date.today().isoformat() in data["days"]:
            return self.state()  # Already up today: nothing to ring for.
        s = data["settings"]
        sunrise_seconds = (8 if test else s["sunrise"] * 60) if s["sunrise"] else 0
        ring_at = datetime.now() + timedelta(seconds=sunrise_seconds)
        self.alarm = {"active": True, "test": test, "phase": "sunrise" if sunrise_seconds else "ring",
                      "ringAt": ring_at.strftime("%H:%M:%S"), "sunriseSeconds": sunrise_seconds}
        self.alarm_generation = getattr(self, "alarm_generation", 0) + 1
        gen = self.alarm_generation
        log.info("alarm %s%s", "test" if test else "started", f", sunrise {sunrise_seconds}s" if sunrise_seconds else "")
        threading.Thread(target=pc_alarm.full_brightness, daemon=True).start()

        def ring():
            if not self.alarm["active"] or self.alarm_generation != gen:
                return  # Checked in during the sunrise, or a newer alarm took over.
            self.alarm["phase"] = "ring"
            threading.Thread(target=pc_alarm.set_volume, args=(s["alarmVolume"],), daemon=True).start()
            self.ringer.start(max_minutes=0.25 if test else s["alarmMax"], sound=s["alarmSound"],
                              ramp_seconds=min(s["alarmRamp"], 12) if test else s["alarmRamp"])
            if test:
                later(15, lambda: self.stop_alarm(only_test=True))

        if sunrise_seconds:
            later(sunrise_seconds, ring)
        else:
            ring()
        return self.state()

    def stop_alarm(self, only_test=False):
        if only_test and not self.alarm.get("test"):
            return self.state()
        if self.alarm["active"]:
            log.info("alarm stopped")
        self.alarm = {"active": False, "test": False}
        self.alarm_generation = getattr(self, "alarm_generation", 0) + 1
        self.ringer.stop()
        return self.state()

    def alarm_action(self, body):
        action = body.get("action")
        if action == "test":
            return self.start_alarm(test=True)
        if action == "start":
            return self.start_alarm()
        if action == "stop":
            if not self.alarm.get("test"):
                raise BadRequest("The real alarm only stops when you press I'M UP.")
            return self.stop_alarm()
        raise BadRequest("Unknown alarm action.")

    def sync_pc_alarm(self):
        """Create, update or remove the Windows wake task to match the settings."""
        if not self.manage_pc_alarm:
            return
        s = self.store.load()["settings"]
        try:
            if s.get("pcAlarm"):
                ok, msg = pc_alarm.install(s["weekday"], s["weekend"], s["alarmOffset"], s["sunrise"])
                self.pc_alarm = {"armed": ok, "next": pc_alarm.next_run() if ok else None, "error": None if ok else msg}
            else:
                pc_alarm.remove()
                self.pc_alarm = {"armed": False, "next": None, "error": None}
        except Exception as e:  # Never let the alarm setup take Waky down.
            log.exception("pc alarm setup")
            self.pc_alarm = {"armed": False, "next": None, "error": str(e)}

    # ---- mood ----

    def set_mood(self, body):
        mood = body.get("mood")
        if mood not in insights.MOODS:
            raise BadRequest("Pick tired, okay or great.")
        data = self.store.load()
        rec = data["days"].get(date.today().isoformat())
        if not rec:
            raise BadRequest("Check in first, then tell Waky how you feel.")
        rec["mood"] = mood
        self.store.save(data)
        return self.state()

    def month_recap(self, ym):
        data = self.store.load()
        if not re.match(r"^\d{4}-\d{2}$", ym or ""):
            raise BadRequest("Use a month like 2026-10.")
        return recap.month_recap(data, ym)

    # ---- notifications ----

    def window_open(self):
        return time.time() - self.last_seen < 75  # The window refreshes every minute.

    def notify(self, title, body, actions=(), sticky=False):
        """A Windows notification, only when the Waky window isn't open (then the window shows it)."""
        if not self.notifications or self.window_open():
            return
        if not self.store.load()["settings"].get("notifications", True):
            return
        links = [(label, f"http://127.0.0.1:{self.port}/act?do={do}&k={self.act_key}") for label, do in actions]
        notify.show(title, body, links, sticky)

    def test_notification(self, body):
        links = [("Open Waky", f"http://127.0.0.1:{self.port}/act?do=open&k={self.act_key}")]
        if not notify.show("✓ Waky notifications work", "Bedtime and still-up reminders will show up like this.", links):
            raise BadRequest("Windows notifications aren't available here.")
        return {"ok": True}

    def act(self, query):
        """A button pressed in a notification."""
        if query.get("k") != self.act_key:
            return "This link has expired. Open Waky instead."
        action = query.get("do")
        try:
            if action == "bed":
                with self.write_lock:
                    self.going_to_bed({})
                return "🌙 Going to bed: saved. Good night!"
            if action == "stillup":
                with self.write_lock:
                    self.still_up({})
                return "✓ Still up: +5 coins."
            if action == "open":
                open_window(f"http://127.0.0.1:{self.port}", self.store.dir)
                return "Opening Waky…"
        except BadRequest as e:
            return str(e)
        return "Unknown action."

    # ---- bedtime ----

    def going_to_bed(self, body):
        data = self.store.load()
        now = datetime.now()
        morning = night.morning_for(now)
        key = morning.isoformat()
        if key not in data["nights"]:
            wake = stats.target_for(morning, data["settings"])
            data["nights"][key] = {"time": now.strftime("%H:%M"), "target": night.bedtime_for(wake, data["settings"])}
            self.store.save(data)
            log.info("going to bed at %s", data["nights"][key]["time"])
        return self.state()

    def undo_bed(self):
        data = self.store.load()
        data["nights"].pop(night.morning_for(datetime.now()).isoformat(), None)
        self.store.save(data)
        return self.state()

    def sleep_pc(self, body):
        """Put the PC to sleep (not hibernate), with wake timers allowed so the alarm can wake it."""
        if sys.platform != "win32":
            raise BadRequest("Only on Windows.")
        log.info("putting the PC to sleep")
        subprocess.Popen(["powershell", "-NoProfile", "-Command",
                          "Start-Sleep -Seconds 3; Add-Type -AssemblyName System.Windows.Forms; "
                          "[System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"],
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return {"sleeping": True}

    def bed_tick(self):
        """The evening reminder before bedtime and a nudge at bedtime, once each per night."""
        with self.write_lock:
            data = self.store.load()
            s = data["settings"]
            if not s.get("bedtimeOn"):
                return
            t = night.tonight(datetime.now(), s, stats.target_for, data["nights"], data["days"])
            if t["state"] not in ("remind", "due"):
                return
            flags = data.setdefault("bedReminders", {})
            key = f"{t['morning']}:{t['state']}"
            if flags.get(key):
                return
            flags.clear()  # Only tonight's flags matter.
            flags[key] = True
            flags[f"{t['morning']}:remind"] = True  # A nudge at bedtime replaces a missed reminder.
            self.store.save(data)
        self.ringer.chime()
        if t["state"] == "remind":
            self.notify(f"🌙 Bedtime in {t['minutesLeft']} min", f"Bedtime {t['bedtime']}, alarm {t['wake']}. "
                        "Screens off soon, phone to the desk.", [("🌙 Going to bed", "bed")], sticky=True)
        else:
            self.notify("🛏️ Time for bed", f"It's {t['bedtime']}. Press Going to bed, then let the PC sleep.",
                        [("🌙 Going to bed", "bed")], sticky=True)
        token, chat_id = self.store.secrets().get("token"), data["telegram"].get("chat_id")
        if token and chat_id:
            text = (f"🌙 Bedtime in {t['minutesLeft']} min ({t['bedtime']}). Screens off soon, phone to the desk. "
                    f"Alarm {t['wake']}." if t["state"] == "remind"
                    else f"🛏️ It's {t['bedtime']}: time for bed. Press Going to bed in Waky and put the PC to sleep.")
            try:
                telegram.call(token, "sendMessage", chat_id=chat_id, text=text)
            except telegram.TelegramError as e:
                log.warning("bedtime reminder: %s", e)

    def still_up(self, body):
        data = self.store.load()
        now = datetime.now()
        rec = data["days"].get(now.date().isoformat())
        state = stats.still_up_state(rec, now.date(), now.date(), now_minutes()) if rec else "none"
        if state == "done":
            return self.state()
        if state != "open":
            raise BadRequest("The still-up check isn't open right now." if state != "missed"
                             else "Too late: the still-up check has closed for today.")
        rec["stillUp"] = now.strftime("%H:%M")
        self.store.save(data)
        log.info("still up at %s", rec["stillUp"])
        return self.state()

    def still_up_tick(self):
        """At the still-up time: chime on the PC and nudge on Telegram, once."""
        data = self.store.load()
        rec = data["days"].get(date.today().isoformat())
        if not rec or rec.get("stillUpPinged"):
            return
        if stats.still_up_state(rec, date.today(), date.today(), now_minutes()) != "open":
            return
        with self.write_lock:
            data = self.store.load()
            rec = data["days"][date.today().isoformat()]
            if rec.get("stillUpPinged"):
                return
            rec["stillUpPinged"] = True
            self.store.save(data)
        self.ringer.chime()
        deadline_text = stats.from_minutes(stats.to_minutes(rec["stillUpDue"]) + rec.get("stillUpWindow", stats.STILL_UP_WINDOW))
        self.notify("🕒 Still up?", f"Prove you didn't go back to bed. Answer before {deadline_text}: +5 coins.",
                    [("✓ I'm up", "stillup")], sticky=True)
        token, chat_id = self.store.secrets().get("token"), data["telegram"].get("chat_id")
        if token and chat_id:
            deadline = stats.from_minutes(stats.to_minutes(rec["stillUpDue"]) + rec.get("stillUpWindow", stats.STILL_UP_WINDOW))
            try:
                telegram.call(token, "sendMessage", chat_id=chat_id,
                              text=f"🕒 Still up? Go to your PC and press Still up before {deadline}. +5 coins, or half coins if you miss it.")
            except telegram.TelegramError as e:
                log.warning("still-up nudge: %s", e)

    def apply_power_ups(self, data, today, rec):
        """Use a Streak Shield and Double Coins by themselves when they help this check-in."""
        grace = data["settings"]["grace"]
        if not stats.is_on_time(rec, grace):
            return  # A late morning breaks the streak anyway; keep the power-ups for a better day.
        inv = game.inventory(data["opened"], data["days"], data["spent"], set(data["shielded"]))
        yesterday = today - timedelta(days=1)
        if (inv["shields"] and yesterday.isoformat() not in data["days"]
                and stats.current_streak(data["days"], grace, yesterday, set(data["shielded"])) > 0):
            data["shielded"].append(yesterday.isoformat())
            rec["shieldUsed"] = yesterday.isoformat()
        if inv["doubles"]:
            rec["boost"] = 2

    def open_chest(self, body):
        data = self.store.load()
        s = stats.compute(data, date.today(), now_minutes())
        chest = next((c for c in s["game"]["chests"] if c["id"] == body.get("id")), None)
        if not chest:
            raise BadRequest("That chest isn't yours yet.")
        if chest["opened"]:
            return {**self.state(), "prize": chest["prize"], "chest": chest}
        prize = game.roll(chest["kind"], s["journey"]["level"])
        data["opened"][chest["id"]] = {"prize": prize, "openedOn": date.today().isoformat()}
        self.store.save(data)
        log.info("opened %s: %s %s", chest["id"], prize["rarity"], game.prize_text(prize))
        return {**self.state(), "prize": prize, "chest": chest}

    def upsert_day(self, body):
        day, hhmm = body.get("date", ""), body.get("time", "")
        try:
            d = date.fromisoformat(day)
        except ValueError:
            raise BadRequest("Pick a valid date.")
        if not TIME_RE.match(hhmm):
            raise BadRequest("Use a time like 06:30.")
        if d > date.today():
            raise BadRequest("That day hasn't happened yet.")
        data = self.store.load()
        rec = data["days"].get(day) or {
            "target": stats.target_for(d, data["settings"]),
            "reps": data["settings"]["reps"],
            "mode": "added",
            "sent": True,  # Don't post old days to Telegram.
        }
        rec["time"] = hhmm
        data["days"][day] = rec
        self.store.save(data)
        return self.state()

    def delete_day(self, day):
        data = self.store.load()
        data["days"].pop(day, None)
        self.store.save(data)
        return self.state()

    def update_settings(self, body):
        data = self.store.load()
        s = data["settings"]
        for key in ("weekday", "weekend"):
            if key in body:
                if not TIME_RE.match(str(body[key])):
                    raise BadRequest("Use a time like 06:30.")
                s[key] = body[key]
        if "grace" in body:
            s["grace"] = _int(body["grace"], s["grace"], 0, 120)
        if "reps" in body:
            s["reps"] = _int(body["reps"], s["reps"], 1, 200)
        if "sound" in body:
            s["sound"] = bool(body["sound"])
        if "theme" in body:
            need = THEMES.get(body["theme"], {}).get("level")
            if need is None:
                raise BadRequest("Unknown theme.")
            level = stats.compute(data, date.today(), now_minutes())["journey"]["level"]
            if level < need:
                raise BadRequest(f"That theme unlocks when you become {stats.RANKS[need]}.")
            s["theme"] = body["theme"]
        for key in ("pcAlarm", "stillUp", "bedtimeOn", "notifications"):
            if key in body:
                s[key] = bool(body[key])
        if body.get("alarmSound") in pc_alarm.SOUNDS:
            s["alarmSound"] = body["alarmSound"]
        for key, lo, hi in (("alarmOffset", -15, 15), ("alarmRamp", 10, 180), ("alarmVolume", 0, 100),
                            ("alarmMax", 1, 60), ("stillUpAfter", 5, 60), ("stillUpWindow", 3, 30),
                            ("sleepGoal", 360, 600), ("bedRemind", 0, 120), ("sunrise", 0, 20)):
            if key in body:
                s[key] = _int(body[key], s[key], lo, hi)
        if "why" in body:
            s["why"] = " ".join(str(body["why"]).split())[:160]
        self.store.save(data)
        if {"weekday", "weekend", "pcAlarm", "alarmOffset", "sunrise"} & set(body):
            threading.Thread(target=self.sync_pc_alarm, daemon=True).start()
        return self.state()

    # ---- updates ----

    def check_update(self):
        self.update_info = updater.check()
        if self.update_info["error"]:
            log.warning("update check: %s", self.update_info["error"])
        return self.update_info

    def install_update(self, body):
        try:
            new = updater.apply()
        except updater.UpdateError as e:
            log.warning("update failed: %s", e)
            raise BadRequest(str(e))
        log.info("updated to %s (build %s), restarting", new["commit"], new["build"])
        self.update_info = {**self.update_info, **new, "behind": 0, "changes": []}
        if self.on_restart:
            later(0.5, self.on_restart)  # After this response has been sent.
        return {"updated": True, "version": new}

    # ---- rewards ----

    def add_reward(self, body):
        name = str(body.get("name") or "").strip()[:80]
        if not name:
            raise BadRequest("Give the reward a name.")
        data = self.store.load()
        data["rewards"].append({
            "id": f"r{int(time.time() * 1000)}",
            "emoji": str(body.get("emoji") or "🎁").strip()[:4] or "🎁",
            "name": name,
            "cost": _int(body.get("cost"), 100, 1, 100000),
            "tier": body.get("tier") if body.get("tier") in game.TIER_LEVEL else "bronze",
        })
        self.store.save(data)
        return self.state()

    def delete_reward(self, reward_id):
        data = self.store.load()
        data["rewards"] = [r for r in data["rewards"] if r["id"] != reward_id]
        self.store.save(data)
        return self.state()

    def redeem(self, body):
        data = self.store.load()
        reward = next((r for r in data["rewards"] if r["id"] == body.get("id")), None)
        if not reward:
            raise BadRequest("That reward doesn't exist any more.")
        s = stats.compute(data, date.today(), now_minutes())
        tier = reward.get("tier", "bronze")
        if not game.tier_unlocked(tier, s["journey"]["level"]):
            rank = stats.RANKS[game.TIER_LEVEL[tier]]
            raise BadRequest(f"{tier.title()} rewards unlock when you become {rank}.")
        entry = {"id": f"s{int(time.time() * 1000)}", "name": reward["name"], "emoji": reward["emoji"],
                 "cost": reward["cost"], "date": date.today().isoformat(), "tier": tier}
        if body.get("voucher"):
            voucher = game.best_voucher_for(tier, s["game"]["inventory"]["vouchers"])
            if not voucher:
                raise BadRequest(f"You don't have a voucher for {tier.title()} rewards.")
            entry.update(cost=0, voucher=voucher)
        elif reward["cost"] > s["coins"]["balance"]:
            raise BadRequest(f"Not enough coins yet: {s['coins']['balance']} of {reward['cost']}.")
        data["spent"].append(entry)
        self.store.save(data)
        return self.state()

    def undo_redeem(self, spent_id):
        data = self.store.load()
        data["spent"] = [s for s in data["spent"] if s["id"] != spent_id]
        self.store.save(data)
        return self.state()

    # ---- telegram ----

    def connect_telegram(self, body):
        secrets = self.store.secrets()
        token = (body.get("token") or "").strip() or secrets.get("token")
        if not token:
            raise BadRequest("Paste your bot token first.")
        try:
            chat = telegram.find_chat(token)
            telegram.call(token, "sendMessage", chat_id=chat["chat_id"],
                          text="Waky is connected. Your morning check-ins will show up here.")
        except telegram.TelegramError as e:
            raise BadRequest(str(e))
        self.store.save_secrets({**secrets, "token": token})
        data = self.store.load()
        data["telegram"] = {**data["telegram"], **chat}
        self.store.save(data)
        self.telegram_error = None
        self.send_soon()
        return self.state()

    def disconnect_telegram(self):
        self.store.save_secrets({})
        data = self.store.load()
        data["telegram"] = {}
        self.store.save(data)
        self.telegram_error = None
        return self.state()

    def send_soon(self):
        if self.background:
            threading.Thread(target=self.send_checkin, daemon=True).start()

    def send_checkin(self):
        """Post today's check-in if it hasn't gone out yet. Safe to call repeatedly."""
        with self.send_lock:
            data = self.store.load()
            today = date.today()
            rec = data["days"].get(today.isoformat())
            token = self.store.secrets().get("token")
            chat_id = data["telegram"].get("chat_id")
            if not rec or rec.get("sent") or not token or not chat_id:
                return
            try:
                pin = telegram.post_checkin(token, chat_id, checkin_text(data, today),
                                            data["telegram"].get("pin"))
            except telegram.TelegramError as e:
                self.telegram_error = str(e)
                return
            with self.write_lock:
                data = self.store.load()
                data["days"][today.isoformat()]["sent"] = True
                data["telegram"]["pin"] = pin
                self.store.save(data)
            self.telegram_error = None


def now_minutes():
    now = datetime.now()
    return now.hour * 60 + now.minute


def checkin_text(data, today):
    rec = data["days"][today.isoformat()]
    s = stats.compute(data, today)
    late = stats.to_minutes(rec["time"]) - stats.to_minutes(rec["target"])
    if s["today"]["ontime"]:
        when = "on time" if late <= 0 else f"{late} min after target, still on time"
    else:
        when = f"{late} min late"
    lines = [f"✅ Up at {rec['time']} · {when}"]
    if rec.get("reps"):
        lines.append(f"💪 {rec['reps']} push-ups" + (" (counted by hand)" if rec["mode"] == "manual" else ""))
    if s["today"]["coins"]:
        lines.append(f"🪙 +{s['today']['coins']} coins · balance {s['coins']['balance']}")
    if s["streak"]:
        lines.append(f"🔥 {s['streak']}-day streak")
    if s["levelUp"]:
        lines.append(f"⚔️ New level {s['hit']['level']}: {s['hit']['rank']} · {s['hit']['levelName']}")
    if s["hit"]:
        lines.append(f"🧠 Day {s['hit']['days']} · {s['hit']['title']}")
    if s["sleep"]["last"]:
        h, m = divmod(s["sleep"]["last"], 60)
        lines.append(f"😴 Slept {h} h {m:02d} min")
    if rec.get("shieldUsed"):
        lines.append("🛡️ A Streak Shield saved your streak")
    if rec.get("boost"):
        lines.append("⚡ Double Coins used")
    for c in s["game"]["newChests"]:
        lines.append(f"🎁 New {c['name'].lower()}: open it in Waky")
    if data["settings"].get("why"):
        lines.append(f"\n“{data['settings']['why']}”")
    return "\n".join(lines)


class BadRequest(Exception):
    pass


def _int(value, default, lo, hi):
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            app.last_seen = time.time()
            try:
                if self.path == "/api/state":
                    return self._json(app.state())
                if self.path == "/api/ping":
                    return self._json({"app": "waky", "commit": app.update_info.get("commit")})
                if self.path == "/api/update":
                    return self._json(app.check_update())
                if self.path.startswith("/api/recap"):
                    try:
                        return self._json(app.month_recap(self._query().get("month")))
                    except BadRequest as e:
                        return self._json({"error": str(e)}, 400)
                if self.path.startswith("/act?"):
                    return self._html(app.act(self._query()))
                self._static()
            except Exception:
                self._crash()

        def do_POST(self):
            self._route({
                "/api/checkin": app.checkin,
                "/api/days": app.upsert_day,
                "/api/telegram": app.connect_telegram,
                "/api/settings": app.update_settings,
                "/api/rewards": app.add_reward,
                "/api/redeem": app.redeem,
                "/api/update": app.install_update,
                "/api/chests/open": app.open_chest,
                "/api/alarm": app.alarm_action,
                "/api/stillup": app.still_up,
                "/api/bed": app.going_to_bed,
                "/api/mood": app.set_mood,
                "/api/notify-test": app.test_notification,
                "/api/sleep-pc": app.sleep_pc,
            })

        def do_DELETE(self):
            app.last_seen = time.time()
            try:
                with app.write_lock:
                    self._delete()
            except Exception:
                self._crash()

        def _delete(self):
            if self.path.startswith("/api/days/"):
                return self._json(app.delete_day(self.path.rsplit("/", 1)[1]))
            if self.path == "/api/telegram":
                return self._json(app.disconnect_telegram())
            if self.path.startswith("/api/rewards/"):
                return self._json(app.delete_reward(self.path.rsplit("/", 1)[1]))
            if self.path == "/api/bed":
                return self._json(app.undo_bed())
            if self.path.startswith("/api/spent/"):
                return self._json(app.undo_redeem(self.path.rsplit("/", 1)[1]))
            self._json({"error": "Not found"}, 404)

        def _route(self, routes):
            app.last_seen = time.time()
            fn = routes.get(self.path)
            if not fn:
                return self._json({"error": "Not found"}, 404)
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                with app.write_lock:
                    result = fn(body)
                self._json(result)
            except BadRequest as e:
                self._json({"error": str(e)}, 400)
            except json.JSONDecodeError:
                self._json({"error": "Bad request"}, 400)
            except Exception:
                self._crash()

        def _query(self):
            return {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}

        def _html(self, message):
            raw = (f"<!doctype html><meta charset=utf-8><title>Waky</title>"
                   f"<body style='background:#0a0a0d;color:#f4f4f6;font:600 22px system-ui;display:grid;place-items:center;height:90vh'>"
                   f"<div>{html_escape(message)}<p style='font:400 14px system-ui;color:#8d8d99'>You can close this tab.</p></div>"
                   f"<script>setTimeout(() => window.close(), 2500)</script>").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _crash(self):
            # One broken request must never take Waky down: log it and answer with an error.
            log.exception("error handling %s %s", self.command, self.path)
            try:
                self._json({"error": "Something went wrong. It's been written to data/waky.log."}, 500)
            except OSError:
                pass

        def _json(self, payload, code=200):
            raw = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)

        def _static(self):
            rel = self.path.split("?", 1)[0].lstrip("/") or "index.html"
            path = (STATIC / rel).resolve()
            if STATIC not in path.parents or not path.is_file():
                return self._json({"error": "Not found"}, 404)
            raw = path.read_bytes()
            ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix in (".js", ".mjs"):
                ctype = "text/javascript"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(raw)

    return Handler


def find_browser():
    env = os.environ
    candidates = [
        Path(env.get("ProgramFiles(x86)", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(env.get("ProgramFiles", "")) / "Microsoft/Edge/Application/msedge.exe",
        Path(env.get("ProgramFiles", "")) / "Google/Chrome/Application/chrome.exe",
        Path(env.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    found = next((p for p in candidates if p.is_file()), None)
    return str(found) if found else shutil.which("msedge") or shutil.which("chrome")


def open_window(url, data_dir, alarm=False):
    if alarm:
        url += "/?alarm=1"
    browser = find_browser()
    if not browser:
        webbrowser.open(url)
        return
    # Its own profile, so the window keeps the camera permission and looks like an app.
    subprocess.Popen([
        browser, f"--app={url}", f"--user-data-dir={Path(data_dir) / 'window'}",
        "--window-size=1240,860", "--no-first-run", "--no-default-browser-check",
        "--autoplay-policy=no-user-gesture-required",
    ] + (["--start-fullscreen"] if alarm else []))


def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.load(resp)


def already_running(url):
    try:
        with urllib.request.urlopen(url + "/api/ping", timeout=2) as resp:
            return json.load(resp).get("app") == "waky"
    except OSError:
        return False


def setup_logging(data_dir):
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(Path(data_dir) / "waky.log", maxBytes=512_000, backupCount=3,
                                                   encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    # pythonw has no console: send stray prints and tracebacks to the log instead of nowhere.
    if sys.stderr is None:
        sys.stderr = sys.stdout = open(Path(data_dir) / "waky-console.log", "a", encoding="utf-8", buffering=1)


def parse_args():
    load_env(ROOT / ".env")
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("WAKY_PORT", 48990)))
    parser.add_argument("--no-window", action="store_true", help="Don't open the app window (for development).")
    parser.add_argument("--stay", action="store_true", help="Keep running even when the window is closed.")
    parser.add_argument("--data-dir", help="Use another data folder (e.g. for a demo).")
    parser.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--alarm", action="store_true", help="Ring the alarm (used by the Windows wake task).")
    return parser.parse_args()


def main():
    args = parse_args()
    url = f"http://127.0.0.1:{args.port}"
    data_dir = args.data_dir or os.environ.get("WAKY_DATA_DIR") or ROOT / "data"
    setup_logging(data_dir)
    if args.child:
        return run_server(args, data_dir)
    if already_running(url):
        if args.alarm:
            try:
                post(url + "/api/alarm", {"action": "start"})
            except OSError:
                log.exception("couldn't start the alarm")
        if not args.no_window:
            open_window(url, data_dir, alarm=args.alarm)
        return
    supervise(args, url, data_dir)


def supervise(args, url, data_dir):
    """Keep the server alive: restart it after an update, or if it ever crashes."""
    child_args = [sys.executable, str(Path(__file__).resolve()), "--child", "--port", str(args.port)]
    child_args += ["--stay"] * args.stay + (["--data-dir", str(args.data_dir)] if args.data_dir else [])
    window_opened = args.no_window
    crashes = []
    first = True
    while True:
        extra = ["--alarm"] if (args.alarm and first) else []
        first = False
        proc = subprocess.Popen(child_args + extra, cwd=ROOT, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if not window_opened:
            for _ in range(50):  # Wait up to ~10 s for the server to answer, then open the window once.
                if already_running(url) or proc.poll() is not None:
                    break
                time.sleep(0.2)
            open_window(url, data_dir, alarm=args.alarm)
            window_opened = True
        code = proc.wait()
        if code == 0:
            log.info("server stopped normally")
            return
        if code == EXIT_RESTART:
            log.info("restarting after update")
            continue
        crashes = [t for t in crashes if time.time() - t < 3600] + [time.time()]
        log.error("server crashed (exit %s), restart %d this hour", code, len(crashes))
        if len(crashes) > 10:
            log.error("too many crashes, giving up until Waky is opened again")
            return
        time.sleep(min(30, 2 ** len(crashes)))


def run_server(args, data_dir):
    backup = None if args.data_dir else os.environ.get("WAKY_BACKUP_DIR")
    app = App(Store(data_dir, backup or None))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(app))
    exit_code = {"value": 0}

    def restart():
        exit_code["value"] = EXIT_RESTART
        server.shutdown()

    app.on_restart = restart
    app.manage_pc_alarm = not args.data_dir  # Demo/test copies must never touch the real Windows task.
    app.notifications = not args.data_dir
    app.port = args.port

    def background():
        last_check = 0
        threading.Thread(target=app.sync_pc_alarm, daemon=True).start()
        threading.Thread(target=pc_alarm.sound_files, args=(app.store.dir / "sounds",), daemon=True).start()
        while True:
            if time.time() - last_check > UPDATE_CHECK_SECONDS:
                last_check = time.time()
                app.check_update()
            time.sleep(20)
            try:
                app.still_up_tick()
                app.bed_tick()
            except Exception:
                log.exception("still-up / bedtime tick")
            app.send_checkin()  # Retry if Telegram was unreachable at check-in time.
            backed_up = app.store.backup()  # Catch up if Google Drive started after Waky.
            idle = time.time() - app.last_seen > IDLE_EXIT_SECONDS
            if not args.stay and idle and not app.telegram_error and backed_up and not app.alarm["active"]:
                server.shutdown()
                return

    threading.Thread(target=background, daemon=True).start()
    if args.alarm:
        app.start_alarm()
    log.info("Waky started, version %s (build %s)", app.update_info.get("commit"), app.update_info.get("build"))
    server.serve_forever()
    server.server_close()
    sys.exit(exit_code["value"])


if __name__ == "__main__":
    main()

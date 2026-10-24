"""Waky desktop app: a small local server plus an app window.

Run it with `pythonw app/server.py` (the desktop shortcut does this). It serves the
UI on 127.0.0.1, keeps your days in data/waky.json and posts check-ins to Telegram.
"""

import argparse
import json
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
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import stats  # noqa: E402
import telegram  # noqa: E402
from store import Store  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STATIC = Path(__file__).resolve().parent / "static"
IDLE_EXIT_SECONDS = 600
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


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

    # ---- state ----

    def state(self):
        data = self.store.load()
        tg = data["telegram"]
        return {
            "settings": data["settings"],
            "days": data["days"],
            "stats": stats.compute(data, date.today()),
            "telegram": {
                "connected": bool(tg.get("chat_id") and self.store.secrets().get("token")),
                "name": tg.get("name"),
                "bot": tg.get("bot"),
                "chatId": tg.get("chat_id"),
                "error": self.telegram_error,
            },
            "dataDir": str(self.store.dir),
            "backupDir": str(self.store.backup_dir) if self.store.backup_dir else None,
        }

    # ---- days ----

    def checkin(self, body):
        now = datetime.now()
        data = self.store.load()
        key = now.date().isoformat()
        if key not in data["days"]:
            data["days"][key] = {
                "time": now.strftime("%H:%M"),
                "target": stats.target_for(now.date(), data["settings"]),
                "reps": _int(body.get("reps"), data["settings"]["reps"], 1, 500),
                "mode": "manual" if body.get("mode") == "manual" else "camera",
                "sent": False,
            }
            self.store.save(data)
            self.send_soon()
        return self.state()

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
            data = self.store.load()
            data["days"][today.isoformat()]["sent"] = True
            data["telegram"]["pin"] = pin
            self.store.save(data)
            self.telegram_error = None


def checkin_text(data, today):
    rec = data["days"][today.isoformat()]
    s = stats.compute(data, today)
    late = stats.to_minutes(rec["time"]) - stats.to_minutes(rec["target"])
    if s["today"]["ontime"]:
        when = "on time" if late <= 0 else f"{late} min after target, still on time"
    else:
        when = f"{late} min late"
    lines = [f"✅ Up at {rec['time']} · {when}", f"💪 {rec['reps']} push-ups" + (" (counted by hand)" if rec["mode"] == "manual" else "")]
    if s["streak"]:
        lines.append(f"🔥 {s['streak']}-day streak")
    if s["hit"]:
        lines.append(f"🏆 Milestone: {s['hit']['title']}")
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
            if self.path == "/api/state":
                return self._json(app.state())
            if self.path == "/api/ping":
                return self._json({"app": "waky"})
            self._static()

        def do_POST(self):
            self._route({
                "/api/checkin": app.checkin,
                "/api/days": app.upsert_day,
                "/api/telegram": app.connect_telegram,
                "/api/settings": app.update_settings,
            })

        def do_DELETE(self):
            app.last_seen = time.time()
            if self.path.startswith("/api/days/"):
                return self._json(app.delete_day(self.path.rsplit("/", 1)[1]))
            if self.path == "/api/telegram":
                return self._json(app.disconnect_telegram())
            self._json({"error": "Not found"}, 404)

        def _route(self, routes):
            app.last_seen = time.time()
            fn = routes.get(self.path)
            if not fn:
                return self._json({"error": "Not found"}, 404)
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
                self._json(fn(body))
            except BadRequest as e:
                self._json({"error": str(e)}, 400)
            except json.JSONDecodeError:
                self._json({"error": "Bad request"}, 400)

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


def open_window(url, data_dir):
    browser = find_browser()
    if not browser:
        webbrowser.open(url)
        return
    # Its own profile, so the window keeps the camera permission and looks like an app.
    subprocess.Popen([
        browser, f"--app={url}", f"--user-data-dir={Path(data_dir) / 'window'}",
        "--window-size=1240,860", "--no-first-run", "--no-default-browser-check",
    ])


def already_running(url):
    try:
        with urllib.request.urlopen(url + "/api/ping", timeout=2) as resp:
            return json.load(resp).get("app") == "waky"
    except OSError:
        return False


def main():
    load_env(ROOT / ".env")
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("WAKY_PORT", 48990)))
    parser.add_argument("--no-window", action="store_true", help="Don't open the app window (for development).")
    parser.add_argument("--stay", action="store_true", help="Keep running even when the window is closed.")
    parser.add_argument("--data-dir", help="Use another data folder (e.g. for a demo).")
    args = parser.parse_args()

    url = f"http://127.0.0.1:{args.port}"
    data_dir = args.data_dir or os.environ.get("WAKY_DATA_DIR") or ROOT / "data"
    if already_running(url):
        if not args.no_window:
            open_window(url, data_dir)
        return

    backup = None if args.data_dir else os.environ.get("WAKY_BACKUP_DIR")
    app = App(Store(data_dir, backup or None))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(app))

    def background():
        while True:
            time.sleep(60)
            app.send_checkin()  # Retry if Telegram was unreachable at check-in time.
            idle = time.time() - app.last_seen > IDLE_EXIT_SECONDS
            if not args.stay and idle and not app.telegram_error:
                server.shutdown()
                return

    threading.Thread(target=background, daemon=True).start()
    if not args.no_window:
        open_window(url, data_dir)
    server.serve_forever()


if __name__ == "__main__":
    main()

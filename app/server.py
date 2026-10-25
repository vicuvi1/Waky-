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
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

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
        self.update_info = {"behind": 0, "changes": [], "error": None, "checkedAt": None, **updater.version()}
        self.on_restart = None  # Set by the server: stops it so the supervisor starts the new version.
        self.started_at = time.time()

    # ---- state ----

    def state(self):
        data = self.store.load()
        tg = data["telegram"]
        return {
            "settings": data["settings"],
            "days": data["days"],
            "rewards": data["rewards"],
            "spent": data["spent"][-20:],
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
            "backupOk": self.store.backup(),
            "update": self.update_info,
            "uptime": int(time.time() - self.started_at),
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
                "reps": _int(body.get("reps"), 0, 0, 500),
                "mode": body.get("mode") if body.get("mode") in ("camera", "manual") else "button",
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
        if "why" in body:
            s["why"] = " ".join(str(body["why"]).split())[:160]
        self.store.save(data)
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
            threading.Timer(0.5, self.on_restart).start()  # After this response has been sent.
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
            "cost": _int(body.get("cost"), 50, 1, 100000),
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
        balance = stats.compute(data, date.today())["coins"]["balance"]
        if reward["cost"] > balance:
            raise BadRequest(f"Not enough coins yet: {balance} of {reward['cost']}.")
        data["spent"].append({"id": f"s{int(time.time() * 1000)}", "name": reward["name"],
                              "emoji": reward["emoji"], "cost": reward["cost"], "date": date.today().isoformat()})
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
            })

        def do_DELETE(self):
            app.last_seen = time.time()
            try:
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
                self._json(fn(body))
            except BadRequest as e:
                self._json({"error": str(e)}, 400)
            except json.JSONDecodeError:
                self._json({"error": "Bad request"}, 400)
            except Exception:
                self._crash()

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
    return parser.parse_args()


def main():
    args = parse_args()
    url = f"http://127.0.0.1:{args.port}"
    data_dir = args.data_dir or os.environ.get("WAKY_DATA_DIR") or ROOT / "data"
    setup_logging(data_dir)
    if args.child:
        return run_server(args, data_dir)
    if already_running(url):
        if not args.no_window:
            open_window(url, data_dir)
        return
    supervise(args, url, data_dir)


def supervise(args, url, data_dir):
    """Keep the server alive: restart it after an update, or if it ever crashes."""
    child_args = [sys.executable, str(Path(__file__).resolve()), "--child", "--port", str(args.port)]
    child_args += ["--stay"] * args.stay + (["--data-dir", str(args.data_dir)] if args.data_dir else [])
    window_opened = args.no_window
    crashes = []
    while True:
        proc = subprocess.Popen(child_args, cwd=ROOT, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if not window_opened:
            for _ in range(50):  # Wait up to ~10 s for the server to answer, then open the window once.
                if already_running(url) or proc.poll() is not None:
                    break
                time.sleep(0.2)
            open_window(url, data_dir)
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

    def background():
        last_check = 0
        while True:
            if time.time() - last_check > UPDATE_CHECK_SECONDS:
                last_check = time.time()
                app.check_update()
            time.sleep(60)
            app.send_checkin()  # Retry if Telegram was unreachable at check-in time.
            backed_up = app.store.backup()  # Catch up if Google Drive started after Waky.
            idle = time.time() - app.last_seen > IDLE_EXIT_SECONDS
            if not args.stay and idle and not app.telegram_error and backed_up:
                server.shutdown()
                return

    threading.Thread(target=background, daemon=True).start()
    log.info("Waky started, version %s (build %s)", app.update_info.get("commit"), app.update_info.get("build"))
    server.serve_forever()
    server.server_close()
    sys.exit(exit_code["value"])


if __name__ == "__main__":
    main()

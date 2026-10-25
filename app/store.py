"""The data file: settings and one record per day. Written atomically, with a backup copy."""

import json
import os
import shutil
import threading
import time
from datetime import date
from pathlib import Path

from game import DEFAULT_REWARDS, migrate_rewards

KEEP_DAILY = 60

DEFAULT_SETTINGS = {"weekday": "06:30", "weekend": "06:30", "grace": 15, "reps": 20, "sound": True, "why": ""}


class Store:
    def __init__(self, data_dir, backup_dir=None):
        self.dir = Path(data_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / "waky.json"
        self.secrets_path = self.dir / "secrets.json"
        self.backup_dir = Path(backup_dir) if backup_dir else None
        self.lock = threading.RLock()

    def load(self):
        with self.lock:
            try:
                data = _read(self.path) or {}
            except json.JSONDecodeError:
                # Never overwrite a damaged file with an empty one: set it aside.
                os.replace(self.path, self.path.with_suffix(f".damaged-{int(time.time())}.json"))
                data = {}
            data.setdefault("version", 2)
            data["settings"] = {**DEFAULT_SETTINGS, **data.get("settings", {})}
            data.setdefault("days", {})
            data.setdefault("telegram", {})
            data["rewards"] = migrate_rewards(data.get("rewards", [dict(r) for r in DEFAULT_REWARDS]))
            data.setdefault("spent", [])
            data.setdefault("opened", {})  # chest id -> {"prize", "openedOn"}
            data.setdefault("shielded", [])  # missed days saved by a Streak Shield
            return data

    def save(self, data):
        with self.lock:
            _write(self.path, data)
            self.backup()

    def secrets(self):
        try:
            return _read(self.secrets_path) or {}
        except json.JSONDecodeError:
            return {}

    def save_secrets(self, secrets):
        # Kept apart from waky.json so the token never ends up in the backup folder.
        _write(self.secrets_path, secrets)

    def backup(self):
        """Bring the backup folder up to date. Returns False if it couldn't be reached.

        Called after every save and again every minute, because the backup drive (Google Drive)
        may start after Waky does: a missed copy is made as soon as the folder is there.
        """
        if not self.backup_dir or not self.path.exists():
            return True
        with self.lock:
            try:
                latest = self.backup_dir / "waky.json"
                daily = self.backup_dir / "daily" / f"waky-{date.today().isoformat()}.json"
                if not latest.exists() or latest.stat().st_mtime < self.path.stat().st_mtime:
                    self.backup_dir.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(self.path, latest)
                    daily.parent.mkdir(exist_ok=True)
                    shutil.copy2(self.path, daily)
                    # One copy per day for the last KEEP_DAILY days, so a bad edit can't wipe a good backup.
                    for old in sorted(daily.parent.glob("waky-*.json"))[:-KEEP_DAILY]:
                        old.unlink()
                return True
            except OSError:
                return False


def _read(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def _write(path, data):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)

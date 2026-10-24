"""The data file: settings and one record per day. Written atomically, with a backup copy."""

import json
import os
import shutil
import threading
import time
from pathlib import Path

DEFAULT_SETTINGS = {"weekday": "06:30", "weekend": "06:30", "grace": 15, "reps": 20, "sound": True}


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
            return data

    def save(self, data):
        with self.lock:
            _write(self.path, data)
            self._backup()

    def secrets(self):
        try:
            return _read(self.secrets_path) or {}
        except json.JSONDecodeError:
            return {}

    def save_secrets(self, secrets):
        # Kept apart from waky.json so the token never ends up in the backup folder.
        _write(self.secrets_path, secrets)

    def _backup(self):
        if not self.backup_dir:
            return
        try:
            self.backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(self.path, self.backup_dir / "waky.json")
        except OSError:
            pass  # The backup drive may be offline; the local copy is what matters.


def _read(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


def _write(path, data):
    tmp = Path(str(path) + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)

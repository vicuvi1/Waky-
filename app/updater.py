"""Self-update from GitHub: Waky's folder is a git clone, so updating is a fast-forward pull of main."""

import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANCH = "main"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class UpdateError(Exception):
    pass


def git(*args, timeout=60):
    if not shutil.which("git"):
        raise UpdateError("Git isn't installed, so Waky can't update itself.")
    try:
        out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                             timeout=timeout, creationflags=NO_WINDOW)
    except subprocess.TimeoutExpired:
        raise UpdateError("GitHub didn't answer in time. Check your internet and try again.")
    if out.returncode != 0:
        raise UpdateError((out.stderr or out.stdout).strip().splitlines()[-1] if (out.stderr or out.stdout).strip()
                          else f"git {args[0]} failed")
    return out.stdout.strip()


def version():
    try:
        return {
            "commit": git("rev-parse", "--short", "HEAD"),
            "build": int(git("rev-list", "--count", "HEAD")),
            "date": git("log", "-1", "--format=%cs"),
        }
    except UpdateError as e:
        return {"commit": None, "build": None, "date": None, "error": str(e)}


def check():
    """Ask GitHub what's new. Returns the current version plus the commits waiting to be installed."""
    info = {"checkedAt": int(time.time()), **version(), "behind": 0, "changes": [], "error": None}
    try:
        branch = git("rev-parse", "--abbrev-ref", "HEAD")
        if branch != BRANCH:
            raise UpdateError(f"Waky's folder is on the \"{branch}\" branch, not {BRANCH}, so it won't auto-update.")
        git("fetch", "--quiet", "origin", BRANCH)
        info["behind"] = int(git("rev-list", "--count", f"HEAD..origin/{BRANCH}"))
        if info["behind"]:
            log = git("log", "--no-merges", "--format=%s", f"HEAD..origin/{BRANCH}")
            info["changes"] = [line for line in log.splitlines() if line][:8]
    except UpdateError as e:
        info["error"] = str(e)
    return info


def apply():
    """Install the latest version. Only fast-forwards, so it never overwrites anything by surprise.

    Your data (data/, .env) is git-ignored and never touched.
    """
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch != BRANCH:
        raise UpdateError(f"Waky's folder is on the \"{branch}\" branch, not {BRANCH}.")
    if git("status", "--porcelain", "--untracked-files=no"):
        raise UpdateError("Some of Waky's files were edited by hand, so the update was stopped to keep them safe.")
    git("pull", "--ff-only", "--quiet", "origin", BRANCH, timeout=120)
    return version()

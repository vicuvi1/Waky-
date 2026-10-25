import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "app"))

import updater  # noqa: E402


def run(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


class UpdaterTest(unittest.TestCase):
    """A local bare repo plays GitHub; a clone of it plays the Waky folder."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.remote, self.dev, self.app = base / "remote.git", base / "dev", base / "app"
        run(base, "init", "--bare", "-b", "main", str(self.remote))
        run(base, "clone", str(self.remote), str(self.dev))
        for repo in (self.dev,):
            run(repo, "config", "user.email", "t@t")
            run(repo, "config", "user.name", "t")
        self.commit("README.md", "v1", "First version")
        run(self.dev, "push", "-q", "origin", "main")
        run(base, "clone", "-q", str(self.remote), str(self.app))
        self.old_root, updater.ROOT = updater.ROOT, self.app

    def tearDown(self):
        updater.ROOT = self.old_root
        self.tmp.cleanup()

    def commit(self, name, text, message):
        (self.dev / name).write_text(text)
        run(self.dev, "add", name)
        run(self.dev, "commit", "-q", "-m", message)

    def publish(self, message):
        self.commit("README.md", message, message)
        run(self.dev, "push", "-q", "origin", "main")

    def test_up_to_date(self):
        info = updater.check()
        self.assertEqual((info["behind"], info["error"]), (0, None))
        self.assertEqual(info["build"], 1)

    def test_finds_and_installs_an_update(self):
        self.publish("Add the sun button")
        self.publish("Fix the backup")
        info = updater.check()
        self.assertEqual(info["behind"], 2)
        self.assertEqual(info["changes"], ["Fix the backup", "Add the sun button"])
        new = updater.apply()
        self.assertEqual(new["build"], 3)
        self.assertEqual(updater.check()["behind"], 0)
        self.assertEqual((self.app / "README.md").read_text(), "Fix the backup")

    def test_never_touches_hand_edited_files(self):
        self.publish("Something new")
        (self.app / "README.md").write_text("my own edit")
        with self.assertRaises(updater.UpdateError):
            updater.apply()
        self.assertEqual((self.app / "README.md").read_text(), "my own edit")

    def test_untracked_data_is_fine(self):
        self.publish("Something new")
        (self.app / "data").mkdir()
        (self.app / "data" / "waky.json").write_text("{}")  # Like the real git-ignored data folder.
        updater.apply()
        self.assertEqual((self.app / "data" / "waky.json").read_text(), "{}")

    def test_other_branch_is_reported(self):
        run(self.app, "checkout", "-q", "-b", "experiment")
        info = updater.check()
        self.assertIn("experiment", info["error"])


if __name__ == "__main__":
    unittest.main()

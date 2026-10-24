import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bot"))

import nag  # noqa: E402

try:
    TZ = ZoneInfo("Europe/Chisinau")
except ZoneInfoNotFoundError:  # Windows has no tz database without the tzdata package.
    TZ = timezone(timedelta(hours=3))
CFG = {"weekday": "06:30", "weekend": "07:00", "grace": 15, "tz": TZ, "nags": 3, "every": 10}


def at(hhmm, day=22):  # 2026-10-22 is a Thursday, the 24th a Saturday
    h, m = map(int, hhmm.split(":"))
    return datetime(2026, 10, day, h, m, tzinfo=TZ)


class ShouldNagTest(unittest.TestCase):
    def test_not_before_grace_ends(self):
        self.assertFalse(nag.should_nag(at("06:44"), {}, CFG))
        self.assertTrue(nag.should_nag(at("06:45"), {}, CFG))

    def test_weekend_uses_weekend_time(self):
        self.assertFalse(nag.should_nag(at("06:50", 24), {}, CFG))
        self.assertTrue(nag.should_nag(at("07:15", 24), {}, CFG))

    def test_spacing_and_limit(self):
        last = at("06:45").timestamp()
        self.assertFalse(nag.should_nag(at("06:50"), {"sent": 1, "last": last}, CFG))
        self.assertTrue(nag.should_nag(at("06:55"), {"sent": 1, "last": last}, CFG))
        self.assertFalse(nag.should_nag(at("07:30"), {"sent": 3, "last": last}, CFG))

    def test_stops_when_done_or_too_late(self):
        self.assertFalse(nag.should_nag(at("06:50"), {"done": True}, CFG))
        self.assertFalse(nag.should_nag(at("10:00"), {}, CFG))


class PinTest(unittest.TestCase):
    def test_reads_check_in_date_and_streak(self):
        pin = {"text": "✅ Up at 06:31 · on time\n💪 20 push-ups\n🔥 5-day streak", "date": int(at("06:31").timestamp())}
        self.assertEqual(nag.pinned_checkin_day(pin, TZ), at("06:31").date())
        self.assertEqual(nag.streak_from(pin), 5)

    def test_ignores_other_pins(self):
        self.assertIsNone(nag.pinned_checkin_day({"text": "hello", "date": 0}, TZ))
        self.assertIsNone(nag.pinned_checkin_day(None, TZ))

    def test_second_nag_mentions_streak(self):
        self.assertIn("5-day streak", nag.nag_text(2, at("06:55"), 5))
        self.assertIn("06:45", nag.nag_text(1, at("06:45"), 0))


if __name__ == "__main__":
    unittest.main()

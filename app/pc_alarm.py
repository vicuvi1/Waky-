"""The PC as a second alarm: a Windows task wakes the PC and opens Waky, which rings until you're up.

- The task ("Waky Alarm") is created for the current user with "wake the computer to run this task",
  one trigger for weekdays and one for weekends. It needs no admin rights.
- The sound is played by Waky itself (winsound), so it works even if the browser blocks autoplay
  or the window is behind the lock screen. It starts quiet and gets louder.
"""

import ctypes
import math
import struct
import subprocess
import sys
import tempfile
import threading
import wave
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TASK = "Waky Alarm"
VBS = ROOT / "launch" / "Waky.vbs"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
RAMP_SECONDS = 60
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
WEEKEND = ["Saturday", "Sunday"]

try:
    import winsound
except ImportError:  # Not on Windows (tests on other systems): no sound, no task.
    winsound = None


# ---- the Windows task ----

def alarm_time(hhmm, offset_minutes=-1):
    """When the PC rings, relative to the wake-up target (-1 = a minute before, so it's awake in time)."""
    t = datetime(2000, 1, 3, *map(int, hhmm.split(":"))) + timedelta(minutes=offset_minutes)
    return t.strftime("%H:%M")


def task_xml(weekday, weekend, vbs=VBS, offset=-1):
    start = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    def trigger(hhmm, days):
        names = "".join(f"<{d} />" for d in days)
        return (f"<CalendarTrigger><StartBoundary>{start}T{alarm_time(hhmm, offset)}:00</StartBoundary><Enabled>true</Enabled>"
                f"<ScheduleByWeek><DaysOfWeek>{names}</DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek>"
                f"</CalendarTrigger>")

    return f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Waky: wakes the PC and rings until you press I'M UP.</Description></RegistrationInfo>
  <Triggers>{trigger(weekday, WEEKDAYS)}{trigger(weekend, WEEKEND)}</Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>false</StartWhenAvailable>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author"><Exec><Command>C:\\Windows\\System32\\wscript.exe</Command><Arguments>"{vbs}" --alarm</Arguments></Exec></Actions>
</Task>"""


def _run(args, timeout=30):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, creationflags=NO_WINDOW)


def install(weekday, weekend, offset=-1):
    """Create or update the task. Returns (ok, message)."""
    if sys.platform != "win32":
        return False, "The PC alarm only works on Windows."
    with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-16") as f:
        f.write(task_xml(weekday, weekend, offset=offset))
        path = f.name
    try:
        out = _run(["schtasks", "/Create", "/TN", TASK, "/XML", path, "/F"])
    finally:
        Path(path).unlink(missing_ok=True)
    if out.returncode != 0:
        return False, (out.stderr or out.stdout).strip() or "Windows refused to create the alarm task."
    return True, "armed"


def remove():
    if sys.platform == "win32":
        _run(["schtasks", "/Delete", "/TN", TASK, "/F"])


def next_run():
    """When Windows will next wake the PC for Waky, as 'YYYY-MM-DDTHH:MM', or None."""
    if sys.platform != "win32":
        return None
    out = _run(["powershell", "-NoProfile", "-Command",
                f"$i = Get-ScheduledTaskInfo -TaskName '{TASK}' -ErrorAction SilentlyContinue; "
                "if ($i -and $i.NextRunTime) { $i.NextRunTime.ToString('yyyy-MM-ddTHH:mm') }"])
    value = out.stdout.strip()
    return value or None


# ---- volume ----

def set_volume(percent):
    """Set the Windows volume with the volume keys: all the way down, then up (each press is 2%).

    Pressing volume up also unmutes. percent=0 leaves the volume as it is.
    """
    if sys.platform != "win32" or not percent:
        return
    VK_VOLUME_DOWN, VK_VOLUME_UP, KEYUP = 0xAE, 0xAF, 2

    def press(key, times):
        for _ in range(times):
            ctypes.windll.user32.keybd_event(key, 0, 0, 0)
            ctypes.windll.user32.keybd_event(key, 0, KEYUP, 0)

    press(VK_VOLUME_DOWN, 50)
    press(VK_VOLUME_UP, max(1, round(percent / 2)))


# ---- sound ----

RATE = 22050

# Each sound: notes (Hz), seconds between notes, length of one round, decay speed, overtone mix, wave shape.
SOUNDS = {
    "sunrise": {"name": "Sunrise chord", "notes": [523.25, 659.25, 783.99, 1046.5], "step": 0.28, "period": 2.4,
                "decay": 2.2, "overtone": 0.3, "square": False},
    "bells": {"name": "Calm bells", "notes": [392.0, 493.88, 587.33], "step": 0.6, "period": 3.2,
              "decay": 1.2, "overtone": 0.5, "square": False},
    "beeps": {"name": "Classic beeps", "notes": [880.0, 880.0, 880.0, 880.0], "step": 0.18, "period": 1.4,
              "decay": 9.0, "overtone": 0.0, "square": True},
}


def _chime(seconds, gain_at, sound="sunrise"):
    """A repeating pattern of notes; gain_at(t) sets the loudness over time (0..1)."""
    cfg = SOUNDS.get(sound, SOUNDS["sunrise"])
    frames = bytearray()
    for i in range(int(seconds * RATE)):
        t = i / RATE
        local = t % cfg["period"]
        sample = 0.0
        for n, freq in enumerate(cfg["notes"]):
            start = n * cfg["step"]
            if local >= start:
                age = local - start
                env = min(1.0, age / 0.01) * math.exp(-age * cfg["decay"])
                wave_ = math.sin(2 * math.pi * freq * age)
                if cfg["square"]:
                    wave_ = 0.6 if wave_ >= 0 else -0.6
                sample += env * (wave_ + cfg["overtone"] * math.sin(4 * math.pi * freq * age))
        frames += struct.pack("<h", int(max(-1, min(1, sample * 0.32 * gain_at(t))) * 32767))
    return bytes(frames)


def _write(path, frames):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)


def sound_files(folder, sound="sunrise", ramp_seconds=RAMP_SECONDS):
    """Make the alarm sounds once per choice: a ramp from quiet to loud, then a loud loop, plus a soft chime."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    sound = sound if sound in SOUNDS else "sunrise"
    ramp = folder / f"alarm-{sound}-ramp{ramp_seconds}.wav"
    loop, chime = folder / f"alarm-{sound}-loop.wav", folder / "chime.wav"
    period = SOUNDS[sound]["period"]
    if not ramp.exists():
        _write(ramp, _chime(ramp_seconds, lambda t: 0.15 + 0.85 * (t / ramp_seconds) ** 1.5, sound))
    if not loop.exists():
        _write(loop, _chime(period * 2, lambda t: 1.0, sound))
    if not chime.exists():
        _write(chime, _chime(2.4, lambda t: 0.6))
    return ramp, loop, chime


class Ringer:
    """Plays the alarm until stopped: the ramp, then the loud loop. Stops by itself after max_minutes."""

    def __init__(self, folder):
        self.folder = folder
        self.lock = threading.Lock()
        self.ringing = False
        self.generation = 0

    def start(self, max_minutes=20, sound="sunrise", ramp_seconds=RAMP_SECONDS):
        if not winsound:
            return
        ramp, loop, _ = sound_files(self.folder, sound, ramp_seconds)
        with self.lock:
            self.generation += 1
            gen = self.generation
            self.ringing = True
        winsound.PlaySound(str(ramp), winsound.SND_FILENAME | winsound.SND_ASYNC)

        def louder():
            with self.lock:
                if self.ringing and self.generation == gen:
                    winsound.PlaySound(str(loop), winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_LOOP)

        threading.Timer(ramp_seconds, louder).start()
        threading.Timer(max_minutes * 60, lambda: self.stop(gen)).start()

    def stop(self, generation=None):
        if not winsound:
            return
        with self.lock:
            if generation is not None and generation != self.generation:
                return  # An old auto-stop timer; a newer alarm is ringing.
            self.ringing = False
            winsound.PlaySound(None, winsound.SND_PURGE)

    def chime(self):
        if winsound and not self.ringing:
            _, _, chime = sound_files(self.folder)
            winsound.PlaySound(str(chime), winsound.SND_FILENAME | winsound.SND_ASYNC)

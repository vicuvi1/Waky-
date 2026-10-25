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

def alarm_time(hhmm, lead_minutes=1):
    """The task fires a minute early, so the PC is awake and ringing by the target time."""
    t = datetime(2000, 1, 3, *map(int, hhmm.split(":"))) - timedelta(minutes=lead_minutes)
    return t.strftime("%H:%M")


def task_xml(weekday, weekend, vbs=VBS):
    start = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    def trigger(hhmm, days):
        names = "".join(f"<{d} />" for d in days)
        return (f"<CalendarTrigger><StartBoundary>{start}T{alarm_time(hhmm)}:00</StartBoundary><Enabled>true</Enabled>"
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


def install(weekday, weekend):
    """Create or update the task. Returns (ok, message)."""
    if sys.platform != "win32":
        return False, "The PC alarm only works on Windows."
    with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-16") as f:
        f.write(task_xml(weekday, weekend))
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

def volume_up(steps=30):
    """Press the volume-up key: unmutes Windows and raises the volume (each press is about 2%)."""
    if sys.platform != "win32":
        return
    VK_VOLUME_UP, KEYUP = 0xAF, 2
    for _ in range(steps):
        ctypes.windll.user32.keybd_event(VK_VOLUME_UP, 0, 0, 0)
        ctypes.windll.user32.keybd_event(VK_VOLUME_UP, 0, KEYUP, 0)


# ---- sound ----

RATE = 22050
CHIME = [523.25, 659.25, 783.99, 1046.5]  # C E G C: a rising sunrise chord


def _chime(seconds, gain_at):
    """A repeating rising arpeggio; gain_at(t) sets the loudness over time (0..1)."""
    frames = bytearray()
    period = 2.4
    for i in range(int(seconds * RATE)):
        t = i / RATE
        local = t % period
        sample = 0.0
        for n, freq in enumerate(CHIME):
            start = n * 0.28
            if local >= start:
                age = local - start
                env = min(1.0, age / 0.01) * math.exp(-age * 2.2)
                sample += env * (math.sin(2 * math.pi * freq * age) + 0.3 * math.sin(4 * math.pi * freq * age))
        frames += struct.pack("<h", int(max(-1, min(1, sample * 0.32 * gain_at(t))) * 32767))
    return bytes(frames)


def _write(path, frames):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)


def sound_files(folder):
    """Make the alarm sounds once: a 60 s ramp from quiet to loud, then a loud loop, plus a soft chime."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    ramp, loop, chime = folder / "alarm-ramp.wav", folder / "alarm-loop.wav", folder / "chime.wav"
    if not ramp.exists():
        _write(ramp, _chime(RAMP_SECONDS, lambda t: 0.15 + 0.85 * (t / RAMP_SECONDS) ** 1.5))
    if not loop.exists():
        _write(loop, _chime(4.8, lambda t: 1.0))
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

    def start(self, max_minutes=20):
        if not winsound:
            return
        ramp, loop, _ = sound_files(self.folder)
        with self.lock:
            self.generation += 1
            gen = self.generation
            self.ringing = True
        winsound.PlaySound(str(ramp), winsound.SND_FILENAME | winsound.SND_ASYNC)

        def louder():
            with self.lock:
                if self.ringing and self.generation == gen:
                    winsound.PlaySound(str(loop), winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_LOOP)

        threading.Timer(RAMP_SECONDS, louder).start()
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

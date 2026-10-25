# Waky

Get up, walk to your desk, press "I'm up". Earn coins, level up, claim rewards you picked.

Waky doesn't try to be your alarm: your phone's alarm is better at that. Waky is the part
after the alarm. It proves you got out of bed, keeps your streak, and shows how consistent
you are. If you haven't checked in by your wake-up time, a Telegram bot nags you.

## How it works

1. **Phone alarm rings.** Charge the phone at your desk, so you have to get up to turn it off.
2. **Press "I'm up"** in Waky at the desk. (Optional: check in with push-ups counted by the webcam instead.)
3. **Coins.** +10 for on time, +15 for before your target, +5 every 7 days in a row, +20 for a new level.
   Late mornings earn nothing but never cost coins. Spend them in the reward shop on rewards you set yourself.
4. **Journey.** A timeline of levels (Waking up → Adjusting → Body clock locked in → The habit → Identity),
   each day explaining what's changing in your body and brain. It counts good mornings in total, so a bad
   day pauses it but never sends you back.
5. **No check-in?** At your target + 15 minutes, the nag bot messages you on Telegram, up to three times.

A day is **on time** if you check in within the grace window (default 15 minutes) after your
target. The streak counts on-time days in a row.

## Run it (Windows)

Needs Python 3.10+ and Edge or Chrome. No packages to install.

```powershell
powershell -ExecutionPolicy Bypass -File launch\install.ps1
```

That puts a **Waky** shortcut on the desktop and in Startup. Or run `python app\server.py` directly.

The app is a small local server (`app/server.py`, port 48990) plus an app window. It shuts down
10 minutes after you close the window.

### Updates and staying up

- **Settings → Updates** checks GitHub (Waky also checks by itself every 6 hours) and installs a new
  version with one click: a fast-forward `git pull` of `main`, then Waky restarts itself. Your data
  (`data/`, `.env`) is git-ignored and never touched. The Waky folder must be a git clone on `main`.
- A small supervisor keeps the server alive: it restarts it after an update, or within seconds if it
  crashes (up to 10 times an hour).
- Errors go to `data/waky.log`. **Settings → Health** shows uptime, the Drive backup, Telegram and updates.

### Settings

- Wake-up times (weekdays and weekends), grace window, push-up count, sounds: in the app.
- Telegram: paste your bot token in *Settings → Telegram*, send `/start` to the bot, press Connect.
  The token is stored in `data/secrets.json`, never in git.
- Optional `.env` (see `.env.example`): `WAKY_BACKUP_DIR` copies `waky.json` to another folder
  (e.g. Google Drive) after every change, plus one dated copy per day in `daily/` (60 days kept).
  If the folder isn't there yet (Google Drive starts after Waky), it retries every minute.

Your data is one file, `data/waky.json`. History can be edited and deleted in *Progress → History*.

## Nag bot (server)

`bot/nag.py` runs 24/7 on a server, so it works while the PC is off. It's one file, standard
library only, no database. It doesn't talk to the PC: it reads the pinned message in your chat
and checks whether today's check-in is there.

```bash
sudo mkdir -p /opt/waky && sudo chown ubuntu /opt/waky
git clone https://github.com/vicuvi1/Waky-.git /opt/waky
cp /opt/waky/bot/.env.example /opt/waky/bot/.env   # fill in token, chat id, times
sudo cp /opt/waky/bot/waky-nag.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now waky-nag
```

The wake-up times in `bot/.env` must match the ones in the app.

## Tests

```bash
python -m unittest discover -s tests
node --test tests/pushups.test.mjs
```

## Layout

```
app/server.py        local server: API, storage, Telegram check-in, app window
app/stats.py         streaks, averages, calendar, milestones
app/store.py         data file (atomic writes, backup copy, damaged-file guard)
app/telegram.py      Bot API calls
app/static/          the UI (plain HTML/CSS/JS, no build step)
  pushups.js         rep counter + pose checks (tested)
  camera.js          webcam + MediaPipe
bot/nag.py           the reminder bot
launch/              shortcut installer, launcher, icon
```

The old v1 (Expo app, "Spartan" desktop app) is kept under the `v1-archive` tag.

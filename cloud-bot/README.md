# WAKY 24/7 Spartan King Cloud Bot

Dedicated 24/7 Telegram cloud memory daemon deployed to Oracle Cloud Ubuntu server (`hermes-vm`).

## Architecture
- **Host:** `hermes-vm` (Oracle Cloud VM, 92.5.93.119)
- **Service Name:** `waky-bot.service`
- **Location:** `/opt/waky-bot/`
- **Python Runtime:** Python 3.12 virtualenv (`/opt/waky-bot/.venv`)
- **Memory Persistence:** `/opt/waky-bot/waky_memory.json`
- **Telegram Bot:** `@wakyyyy_bot` (Token: `8814364854:AAE3HpffTsEX3x6xnl74Fx0Lff6OxOxeTeA`)
- **Primary Sovereign ID:** `1900611848`

## Features
- **24/7 Independent Memory:** Never loses wake logs, streaks, or dopamine milestones even when the local desktop PC is shut down.
- **Mobile Telegram Commands:**
  - `/report` - Comprehensive dawn intelligence report (current streak, all-time record, consistency %, average wake-up time, current Spartan rank, next biological milestone, and last 5 battles).
  - `/streak` - Active streak countdown with visual progress bar towards the 90-day sovereign transformation.
  - `/milestones` - The 8 stages of neuroplasticity and dopamine reset (Days 1, 3, 7, 14, 21, 30, 60, 90).
  - `/trophies` - Unlocked RPG badges.
  - `/log [HH:MM]` - Direct check-in fallback from mobile Telegram.
  - `/alarm [HH:MM]` - Adjust target wake time.
- **Bi-directional PC Sync:**
  - WAKY Desktop app seamlessly synchronizes records with `hermes-vm` over secure SSH/SCP on startup and after every webcam verification.

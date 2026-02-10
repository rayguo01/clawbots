---
name: oura-ring
description: Sync and analyze Oura Ring health data — sleep, readiness, activity, heart rate, stress, SpO2, workouts. 关键词：Oura戒指、睡眠质量、身体准备度、心率、压力、血氧、运动记录。
homepage: https://ouraring.com
metadata:
  {
    "openclaw":
      {
        "emoji": "💍",
        "requires": { "bins": ["uv"], "env": ["OURA_TOKEN"] },
        "primaryEnv": "OURA_TOKEN",
        "install":
          [
            {
              "id": "uv-brew",
              "kind": "brew",
              "formula": "uv",
              "bins": ["uv"],
              "label": "Install uv (brew)",
            },
          ],
      },
  }
---

# Oura Ring Health Data

This skill syncs your daily health data from Oura Ring into readable markdown files.

## Syncing Data

Sync today's data:

```bash
uv run {baseDir}/scripts/sync_oura.py
```

Sync a specific date:

```bash
uv run {baseDir}/scripts/sync_oura.py --date 2026-02-07
```

Sync the last N days:

```bash
uv run {baseDir}/scripts/sync_oura.py --days 7
```

## Reading Health Data

Health files are stored at `{baseDir}/health/YYYY-MM-DD.md` — one file per day.

To answer health or fitness questions, read the relevant date's file from the `{baseDir}/health/` directory. If the file doesn't exist for the requested date, run the sync command for that date first.

## Data Covered

- **Sleep** — duration, stages (deep/light/REM/awake), sleep score, bedtime/wake time, efficiency
- **Readiness** — score, temperature deviation, HRV balance, recovery index
- **Activity** — steps, calories, distance, active minutes
- **Stress** — high stress minutes, recovery minutes
- **Heart Rate** — resting, min, max
- **SpO2** — blood oxygen percentage
- **Workouts** — type, duration, distance, calories

## How to Respond

When the user asks about health or Oura data:

1. **Sync first** — run the sync script for the requested date(s) if the markdown file doesn't exist yet
2. **Read the file** — read `{baseDir}/health/YYYY-MM-DD.md` for the relevant date
3. **Interpret the data** — provide friendly, encouraging insights:
   - Sleep score >85 is excellent, 70-85 is good, <70 needs attention
   - Readiness score >85 means go hard, 70-85 take it easy, <70 prioritize recovery
   - Resting HR trending down = improving fitness
   - SpO2 >95% is normal
4. **Be conversational** — "You got 7.5 hours of solid sleep with great deep sleep!" not just data dumps
5. **For trends** — sync multiple days (`--days 7`) and compare across files

## Cron Setup

Schedule the sync script to run every morning using OpenClaw's `cron` tool so your health data stays up to date automatically.

## Language

Respond in the same language as the user's message. Support both English and Chinese naturally.

---
name: luma
description: "Fetch upcoming events from Luma (lu.ma) for any city. Use when user asks about tech events, startup meetups, networking events, conferences, or things happening in a city. Keywords: events, meetups, conferences, luma, lu.ma, tech events, startup events. 关键词：活动、聚会、会议、技术活动、创业活动、线下活动、lu.ma、什么活动、哪些活动。"
metadata: { "openclaw": { "requires": { "bins": ["python3"] } } }
---

# Luma Events Skill

Fetch structured event data from Luma (lu.ma) without authentication. Luma is a popular platform for tech meetups, startup events, conferences, and community gatherings.

## How It Works

Luma is a Next.js SSR app. All event data is embedded in the HTML as JSON inside a `<script id="__NEXT_DATA__">` tag. The Python script extracts this data - no API key needed.

## Usage

```bash
python3 {baseDir}/scripts/fetch_events.py <city> [cities...] [--days N] [--max N] [--json]
```

### Parameters

- **`city`**: City slug (lowercase, hyphenated, e.g. san-francisco)
- **`--days N`**: Only show events within N days (default: 30)
- **`--max N`**: Maximum events per city (default: 20)
- **`--json`**: Output raw JSON instead of formatted text

### Popular City Slugs

- **Southeast Asia**: singapore, jakarta, bangkok, kuala-lumpur, ho-chi-minh-city
- **India**: bengaluru, mumbai, delhi, hyderabad, pune
- **USA**: san-francisco, new-york, austin, seattle, boston
- **Global**: london, dubai, toronto, sydney, tokyo, berlin

## Common Use Cases

### Find tech events this week

```bash
python3 {baseDir}/scripts/fetch_events.py singapore --days 7
```

### Check multiple cities

```bash
python3 {baseDir}/scripts/fetch_events.py singapore bengaluru san-francisco --days 14
```

### Get next 5 events in a city

```bash
python3 {baseDir}/scripts/fetch_events.py new-york --max 5
```

### Get JSON output for further processing

```bash
python3 {baseDir}/scripts/fetch_events.py bengaluru --days 14 --json
```

## Behavior Guidelines

1. When user asks about events in a city, determine the city slug and run the script.
2. If the user doesn't specify a time range, default to `--days 14`.
3. Present results in a concise, readable format. Highlight free events and events with limited spots.
4. If no events are found, suggest trying a broader date range or nearby cities.
5. For Chinese-speaking users, translate event details to Chinese when presenting.

## Notes

- **No authentication**: Luma event pages are public, no API key needed.
- **City slugs**: Use lowercase, hyphenated slugs (san-francisco, not San Francisco).
- **Rate limiting**: Only fetch when user explicitly asks. Don't fetch speculatively.
- **Data freshness**: Events are live data from the HTML, always current.

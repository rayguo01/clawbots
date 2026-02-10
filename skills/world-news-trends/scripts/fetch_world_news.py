#!/usr/bin/env python3
"""
Fetch trending international news from multiple RSS sources.
No external dependencies - uses Python stdlib only.

Sources: BBC, Al Jazeera, CNA (Channel NewsAsia), Reuters, TechCrunch, Ars Technica
"""

import urllib.request
import json
import re
import argparse
import ssl
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── RSS Feed Registry ──────────────────────────────────────

FEEDS = {
    # ── World / General ──
    "bbc-world": {
        "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "name": "BBC World",
        "section": "world",
    },
    "bbc-top": {
        "url": "https://feeds.bbci.co.uk/news/rss.xml",
        "name": "BBC Top Stories",
        "section": "world",
    },
    "aljazeera": {
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "name": "Al Jazeera",
        "section": "world",
    },
    # ── Asia / SEA ──
    "bbc-asia": {
        "url": "https://feeds.bbci.co.uk/news/world/asia/rss.xml",
        "name": "BBC Asia",
        "section": "asia",
    },
    "cna-asia": {
        "url": "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",
        "name": "CNA (Channel NewsAsia)",
        "section": "asia",
    },
    "cna-sg": {
        "url": "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511",
        "name": "CNA Singapore",
        "section": "asia",
    },
    # ── Tech ──
    "bbc-tech": {
        "url": "https://feeds.bbci.co.uk/news/technology/rss.xml",
        "name": "BBC Technology",
        "section": "tech",
    },
    "techcrunch": {
        "url": "https://techcrunch.com/feed/",
        "name": "TechCrunch",
        "section": "tech",
    },
    "arstechnica": {
        "url": "https://feeds.arstechnica.com/arstechnica/index",
        "name": "Ars Technica",
        "section": "tech",
    },
    # ── Business ──
    "bbc-business": {
        "url": "https://feeds.bbci.co.uk/news/business/rss.xml",
        "name": "BBC Business",
        "section": "business",
    },
    # ── Science ──
    "bbc-science": {
        "url": "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml",
        "name": "BBC Science",
        "section": "science",
    },
    # ── Regional ──
    "bbc-mideast": {
        "url": "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
        "name": "BBC Middle East",
        "section": "world",
    },
    "bbc-europe": {
        "url": "https://feeds.bbci.co.uk/news/world/europe/rss.xml",
        "name": "BBC Europe",
        "section": "world",
    },
    "bbc-us": {
        "url": "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
        "name": "BBC US & Canada",
        "section": "world",
    },
}

# Section groupings for --section filter
SECTIONS = {
    "world": "World & General News",
    "asia": "Asia & Southeast Asia",
    "tech": "Technology",
    "business": "Business & Finance",
    "science": "Science & Environment",
}

# Default sections to fetch when no filter specified
DEFAULT_SECTIONS = ["world", "asia", "tech", "business"]


def _strip_html(text):
    """Remove HTML tags and decode entities."""
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    return text.strip()


def _parse_date(date_str):
    """Parse RSS date string to datetime. Returns None on failure."""
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        pass
    # Try ISO format
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def fetch_single_feed(feed_id, feed_info):
    """Fetch and parse a single RSS feed. Returns list of items."""
    url = feed_info["url"]
    source_name = feed_info["name"]
    section = feed_info["section"]

    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)",
                "Accept": "application/rss+xml, application/xml, text/xml, */*",
            },
        )
        with urllib.request.urlopen(req, timeout=12, context=ctx) as response:
            data = response.read()
    except Exception as e:
        return [], f"{source_name}: {e}"

    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        return [], f"{source_name}: XML parse error: {e}"

    items = []

    # Handle RSS 2.0: <rss><channel><item>
    for item_el in root.iter("item"):
        title = (item_el.findtext("title") or "").strip()
        link = (item_el.findtext("link") or "").strip()
        desc = _strip_html(item_el.findtext("description") or "")
        pub_date_str = item_el.findtext("pubDate") or ""
        pub_date = _parse_date(pub_date_str)

        if not title:
            continue

        items.append(
            {
                "title": title,
                "link": link,
                "description": desc[:200] if desc else "",
                "source": source_name,
                "section": section,
                "published": pub_date.isoformat() if pub_date else "",
                "_dt": pub_date,  # for sorting, removed before output
            }
        )

    # Handle Atom: <feed><entry>
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
        title = (entry.findtext("atom:title", namespaces=ns) or entry.findtext("{http://www.w3.org/2005/Atom}title") or "").strip()
        link_el = entry.find("{http://www.w3.org/2005/Atom}link")
        link = link_el.get("href", "") if link_el is not None else ""
        desc_el = entry.findtext("{http://www.w3.org/2005/Atom}summary") or entry.findtext("{http://www.w3.org/2005/Atom}content") or ""
        desc = _strip_html(desc_el)
        pub_date_str = entry.findtext("{http://www.w3.org/2005/Atom}published") or entry.findtext("{http://www.w3.org/2005/Atom}updated") or ""
        pub_date = _parse_date(pub_date_str)

        if not title:
            continue

        items.append(
            {
                "title": title,
                "link": link,
                "description": desc[:200] if desc else "",
                "source": source_name,
                "section": section,
                "published": pub_date.isoformat() if pub_date else "",
                "_dt": pub_date,
            }
        )

    return items, None


def deduplicate(items):
    """Remove duplicate articles by normalized title similarity."""
    seen = set()
    unique = []
    for item in items:
        # Normalize: lowercase, strip punctuation, collapse whitespace
        key = re.sub(r"[^\w\s]", "", item["title"].lower())
        key = re.sub(r"\s+", " ", key).strip()
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


def fetch_news(sections=None, max_items=30):
    """Fetch news from multiple RSS feeds in parallel."""
    if sections is None:
        sections = DEFAULT_SECTIONS

    # Select feeds matching requested sections
    selected = {
        fid: info for fid, info in FEEDS.items() if info["section"] in sections
    }

    all_items = []
    errors = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(fetch_single_feed, fid, info): fid
            for fid, info in selected.items()
        }
        for future in as_completed(futures):
            items, err = future.result()
            if err:
                errors.append(err)
            all_items.extend(items)

    # Sort by publish date (newest first)
    now = datetime.now(timezone.utc)
    all_items.sort(key=lambda x: x.get("_dt") or now, reverse=True)

    # Deduplicate
    all_items = deduplicate(all_items)

    # Limit
    all_items = all_items[:max_items]

    # Remove internal _dt field
    for item in all_items:
        item.pop("_dt", None)

    return all_items, errors


def format_human(items, errors=None):
    """Format items for human-readable output."""
    lines = []
    lines.append(f"{'=' * 60}")
    lines.append(f"World News Trends - {len(items)} articles")
    lines.append(f"{'=' * 60}")
    lines.append("")

    for i, item in enumerate(items, 1):
        title = item["title"]
        source = item["source"]
        section = item["section"]
        link = item["link"]
        desc = item.get("description", "")
        published = item.get("published", "")

        lines.append(f"{i}. [{source}] {title}")
        if desc:
            lines.append(f"   {desc[:120]}")
        if published:
            lines.append(f"   Published: {published}")
        lines.append(f"   Link: {link}")
        lines.append("")

    if errors:
        lines.append(f"--- Warnings ({len(errors)}) ---")
        for err in errors:
            lines.append(f"  ! {err}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch international news from multiple RSS sources"
    )
    parser.add_argument(
        "--section",
        "-s",
        choices=list(SECTIONS.keys()),
        nargs="+",
        help="Filter by section (default: world asia tech business)",
    )
    parser.add_argument(
        "--max",
        type=int,
        default=30,
        help="Maximum total items (default: 30)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output JSON instead of formatted text",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all available feeds and sections",
    )
    args = parser.parse_args()

    if args.list:
        print("Available sections:")
        for sid, desc in SECTIONS.items():
            print(f"  {sid:12s} {desc}")
            for fid, info in FEEDS.items():
                if info["section"] == sid:
                    print(f"    - {info['name']:25s} {info['url']}")
        return

    sections = args.section or DEFAULT_SECTIONS
    items, errors = fetch_news(sections=sections, max_items=args.max)

    if args.json:
        print(json.dumps(items, ensure_ascii=False, indent=2), flush=True)
    else:
        print(format_human(items, errors), flush=True)


if __name__ == "__main__":
    main()

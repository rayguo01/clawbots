#!/usr/bin/env python3
"""
Fetch trending topics from TopHub (tophub.today).
No external dependencies - uses Python stdlib only.
"""

import urllib.request
import json
import re
import argparse
from html import unescape


TOPHUB_URL = "https://tophub.today/hot"


def fetch_hot_list():
    """Fetch hot list from TopHub."""
    req = urllib.request.Request(
        TOPHUB_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        html = response.read().decode("utf-8")

    items = []

    # Match each <li class="child-item">...</li> block
    for block in re.finditer(
        r'<li[^>]*class="child-item"[^>]*>(.*?)</li>',
        html,
        re.DOTALL,
    ):
        content = block.group(1)

        # Extract rank from <span class="index-N">N</span>
        rank_m = re.search(r'<span[^>]*class="index-\d+"[^>]*>(\d+)</span>', content)
        rank = rank_m.group(1) if rank_m else ""

        # Extract title and link from <p class="medium-txt"><a href="...">title</a></p>
        link_m = re.search(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', content, re.DOTALL)
        if not link_m:
            continue
        link = unescape(link_m.group(1))
        title = re.sub(r"<[^>]+>", "", link_m.group(2)).strip()
        title = unescape(title)

        if not title:
            continue

        # Make absolute URL
        if not link.startswith("http"):
            link = "https://tophub.today" + link

        # Extract source and heat from <p class="small-txt">知乎 ‧ 958万热度</p>
        small_m = re.search(r'class="[^"]*small-txt[^"]*"[^>]*>(.*?)</p>', content, re.DOTALL)
        source = ""
        hot = ""
        if small_m:
            small_text = re.sub(r"<[^>]+>", "", small_m.group(1)).strip()
            small_text = unescape(small_text)
            parts = [p.strip() for p in small_text.split("\u2027")]  # ‧
            source = parts[0] if parts else ""
            hot = parts[1] if len(parts) > 1 else ""

        items.append(
            {
                "rank": rank,
                "title": title,
                "link": link,
                "source": source,
                "hot": hot,
            }
        )

    return items


def format_human(items, max_items=None):
    """Format items for human-readable output."""
    if max_items:
        items = items[:max_items]

    lines = []
    lines.append(f"{'=' * 60}")
    lines.append(f"TopHub Hot List - {len(items)} items")
    lines.append(f"{'=' * 60}")
    lines.append("")

    for item in items:
        rank = item["rank"]
        title = item["title"]
        source = item["source"]
        hot = item["hot"]
        link = item["link"]

        lines.append(f"{rank}. [{source}] {title}")
        if hot:
            lines.append(f"   Heat: {hot}")
        lines.append(f"   Link: {link}")
        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Fetch TopHub trending topics")
    parser.add_argument(
        "--max",
        type=int,
        default=50,
        help="Maximum items to show (default: 50)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output raw JSON instead of formatted text",
    )
    args = parser.parse_args()

    items = fetch_hot_list()

    if args.max:
        items = items[: args.max]

    if args.json:
        print(json.dumps(items, ensure_ascii=False, indent=2), flush=True)
    else:
        print(format_human(items), flush=True)


if __name__ == "__main__":
    main()

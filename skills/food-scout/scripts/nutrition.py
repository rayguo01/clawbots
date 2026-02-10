# /// script
# requires-python = ">=3.10"
# dependencies = ["requests"]
# ///
"""Food Scout nutrition database with API Ninjas integration.

A self-learning food nutrition database that provides per-100g nutritional data
for common foods. When a food is not found locally, it queries the API Ninjas
nutrition endpoint, normalizes the result to per-100g, and permanently stores
it for future lookups.

All nutritional values are per 100g unless scaled by a serving size in a query.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date
from typing import Any

import requests

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"
)
DB_PATH = os.path.join(DATA_DIR, "food-db.json")

# ---------------------------------------------------------------------------
# Built-in foods (~80 common Chinese foods, values per 100 g)
# Keys are lowercase English names.
# ---------------------------------------------------------------------------

BUILTIN_FOODS: dict[str, dict[str, Any]] = {
    # ── Meat ───────────────────────────────────────────────────────────────
    "chicken breast": {
        "name_cn": "鸡胸肉",
        "calories": 165,
        "protein": 31.0,
        "carbs": 0.0,
        "fat": 3.6,
    },
    "beef": {
        "name_cn": "牛肉",
        "calories": 250,
        "protein": 26.0,
        "carbs": 0.0,
        "fat": 15.0,
    },
    "pork": {
        "name_cn": "猪肉",
        "calories": 242,
        "protein": 27.0,
        "carbs": 0.0,
        "fat": 14.0,
    },
    "salmon": {
        "name_cn": "三文鱼",
        "calories": 208,
        "protein": 20.0,
        "carbs": 0.0,
        "fat": 13.0,
    },
    "shrimp": {
        "name_cn": "虾",
        "calories": 99,
        "protein": 24.0,
        "carbs": 0.2,
        "fat": 0.3,
    },
    "egg": {
        "name_cn": "鸡蛋",
        "calories": 155,
        "protein": 13.0,
        "carbs": 1.1,
        "fat": 11.0,
    },
    "chicken thigh": {
        "name_cn": "鸡腿肉",
        "calories": 209,
        "protein": 26.0,
        "carbs": 0.0,
        "fat": 10.9,
    },
    "beef shank": {
        "name_cn": "牛腱子",
        "calories": 150,
        "protein": 28.0,
        "carbs": 0.0,
        "fat": 3.5,
    },
    "cod": {
        "name_cn": "鳕鱼",
        "calories": 82,
        "protein": 18.0,
        "carbs": 0.0,
        "fat": 0.7,
    },
    "duck": {
        "name_cn": "鸭肉",
        "calories": 337,
        "protein": 19.0,
        "carbs": 0.0,
        "fat": 28.0,
    },
    "lamb": {
        "name_cn": "羊肉",
        "calories": 294,
        "protein": 25.0,
        "carbs": 0.0,
        "fat": 21.0,
    },
    "pork belly": {
        "name_cn": "五花肉",
        "calories": 518,
        "protein": 9.0,
        "carbs": 0.0,
        "fat": 53.0,
    },
    "chicken wing": {
        "name_cn": "鸡翅",
        "calories": 203,
        "protein": 30.0,
        "carbs": 0.0,
        "fat": 8.1,
    },
    "tuna": {
        "name_cn": "金枪鱼",
        "calories": 132,
        "protein": 28.0,
        "carbs": 0.0,
        "fat": 1.3,
    },
    "tilapia": {
        "name_cn": "罗非鱼",
        "calories": 96,
        "protein": 20.0,
        "carbs": 0.0,
        "fat": 1.7,
    },
    # ── Vegetables ─────────────────────────────────────────────────────────
    "broccoli": {
        "name_cn": "西兰花",
        "calories": 34,
        "protein": 2.8,
        "carbs": 7.0,
        "fat": 0.4,
    },
    "spinach": {
        "name_cn": "菠菜",
        "calories": 23,
        "protein": 2.9,
        "carbs": 3.6,
        "fat": 0.4,
    },
    "tomato": {
        "name_cn": "番茄",
        "calories": 18,
        "protein": 0.9,
        "carbs": 3.9,
        "fat": 0.2,
    },
    "cucumber": {
        "name_cn": "黄瓜",
        "calories": 15,
        "protein": 0.7,
        "carbs": 3.6,
        "fat": 0.1,
    },
    "carrot": {
        "name_cn": "胡萝卜",
        "calories": 41,
        "protein": 0.9,
        "carbs": 10.0,
        "fat": 0.2,
    },
    "pumpkin": {
        "name_cn": "南瓜",
        "calories": 26,
        "protein": 1.0,
        "carbs": 6.5,
        "fat": 0.1,
    },
    "corn": {
        "name_cn": "玉米",
        "calories": 86,
        "protein": 3.3,
        "carbs": 19.0,
        "fat": 1.4,
    },
    "lettuce": {
        "name_cn": "生菜",
        "calories": 15,
        "protein": 1.4,
        "carbs": 2.9,
        "fat": 0.2,
    },
    "celery": {
        "name_cn": "芹菜",
        "calories": 16,
        "protein": 0.7,
        "carbs": 3.0,
        "fat": 0.2,
    },
    "chinese cabbage": {
        "name_cn": "白菜",
        "calories": 13,
        "protein": 1.5,
        "carbs": 2.2,
        "fat": 0.2,
    },
    "mushroom": {
        "name_cn": "蘑菇",
        "calories": 22,
        "protein": 3.1,
        "carbs": 3.3,
        "fat": 0.3,
    },
    "eggplant": {
        "name_cn": "茄子",
        "calories": 25,
        "protein": 1.0,
        "carbs": 6.0,
        "fat": 0.2,
    },
    "green beans": {
        "name_cn": "四季豆",
        "calories": 31,
        "protein": 1.8,
        "carbs": 7.0,
        "fat": 0.1,
    },
    "bell pepper": {
        "name_cn": "彩椒",
        "calories": 31,
        "protein": 1.0,
        "carbs": 6.0,
        "fat": 0.3,
    },
    "bok choy": {
        "name_cn": "小白菜",
        "calories": 13,
        "protein": 1.5,
        "carbs": 2.2,
        "fat": 0.2,
    },
    "asparagus": {
        "name_cn": "芦笋",
        "calories": 20,
        "protein": 2.2,
        "carbs": 3.9,
        "fat": 0.1,
    },
    "zucchini": {
        "name_cn": "西葫芦",
        "calories": 17,
        "protein": 1.2,
        "carbs": 3.1,
        "fat": 0.3,
    },
    "bean sprouts": {
        "name_cn": "豆芽",
        "calories": 31,
        "protein": 3.0,
        "carbs": 5.9,
        "fat": 0.2,
    },
    "snow peas": {
        "name_cn": "荷兰豆",
        "calories": 42,
        "protein": 2.8,
        "carbs": 7.6,
        "fat": 0.2,
    },
    "cauliflower": {
        "name_cn": "花椰菜",
        "calories": 25,
        "protein": 1.9,
        "carbs": 5.0,
        "fat": 0.3,
    },
    # ── Staples ────────────────────────────────────────────────────────────
    "cooked rice": {
        "name_cn": "米饭",
        "calories": 130,
        "protein": 2.7,
        "carbs": 28.0,
        "fat": 0.3,
    },
    "rice": {
        "name_cn": "米饭",
        "calories": 130,
        "protein": 2.7,
        "carbs": 28.0,
        "fat": 0.3,
    },
    "brown rice": {
        "name_cn": "糙米饭",
        "calories": 123,
        "protein": 2.7,
        "carbs": 26.0,
        "fat": 1.0,
    },
    "noodles": {
        "name_cn": "面条",
        "calories": 138,
        "protein": 4.5,
        "carbs": 25.0,
        "fat": 2.1,
    },
    "whole wheat bread": {
        "name_cn": "全麦面包",
        "calories": 247,
        "protein": 13.0,
        "carbs": 41.0,
        "fat": 3.4,
    },
    "sweet potato": {
        "name_cn": "红薯",
        "calories": 86,
        "protein": 1.6,
        "carbs": 20.0,
        "fat": 0.1,
    },
    "oatmeal": {
        "name_cn": "燕麦",
        "calories": 68,
        "protein": 2.4,
        "carbs": 12.0,
        "fat": 1.4,
    },
    "steamed bun": {
        "name_cn": "馒头",
        "calories": 223,
        "protein": 7.0,
        "carbs": 45.0,
        "fat": 1.1,
    },
    "quinoa": {
        "name_cn": "藜麦",
        "calories": 120,
        "protein": 4.4,
        "carbs": 21.0,
        "fat": 1.9,
    },
    "white bread": {
        "name_cn": "白面包",
        "calories": 265,
        "protein": 9.0,
        "carbs": 49.0,
        "fat": 3.2,
    },
    "pasta": {
        "name_cn": "意面",
        "calories": 131,
        "protein": 5.0,
        "carbs": 25.0,
        "fat": 1.1,
    },
    "congee": {
        "name_cn": "白粥",
        "calories": 46,
        "protein": 1.1,
        "carbs": 10.0,
        "fat": 0.1,
    },
    "fried rice": {
        "name_cn": "炒饭",
        "calories": 186,
        "protein": 4.0,
        "carbs": 26.0,
        "fat": 7.0,
    },
    "dumpling wrapper": {
        "name_cn": "饺子皮",
        "calories": 291,
        "protein": 8.0,
        "carbs": 58.0,
        "fat": 1.5,
    },
    "taro": {
        "name_cn": "芋头",
        "calories": 112,
        "protein": 1.5,
        "carbs": 26.0,
        "fat": 0.1,
    },
    "potato": {
        "name_cn": "土豆",
        "calories": 77,
        "protein": 2.0,
        "carbs": 17.0,
        "fat": 0.1,
    },
    # ── Soy products ──────────────────────────────────────────────────────
    "tofu": {
        "name_cn": "豆腐",
        "calories": 76,
        "protein": 8.0,
        "carbs": 1.9,
        "fat": 4.8,
    },
    "soy milk": {
        "name_cn": "豆浆",
        "calories": 33,
        "protein": 2.9,
        "carbs": 1.8,
        "fat": 1.6,
    },
    "edamame": {
        "name_cn": "毛豆",
        "calories": 121,
        "protein": 11.0,
        "carbs": 9.0,
        "fat": 5.2,
    },
    "dried tofu": {
        "name_cn": "豆腐干",
        "calories": 140,
        "protein": 16.0,
        "carbs": 3.5,
        "fat": 7.0,
    },
    # ── Fruits ─────────────────────────────────────────────────────────────
    "apple": {
        "name_cn": "苹果",
        "calories": 52,
        "protein": 0.3,
        "carbs": 14.0,
        "fat": 0.2,
    },
    "banana": {
        "name_cn": "香蕉",
        "calories": 89,
        "protein": 1.1,
        "carbs": 23.0,
        "fat": 0.3,
    },
    "avocado": {
        "name_cn": "牛油果",
        "calories": 160,
        "protein": 2.0,
        "carbs": 9.0,
        "fat": 15.0,
    },
    "blueberry": {
        "name_cn": "蓝莓",
        "calories": 57,
        "protein": 0.7,
        "carbs": 14.0,
        "fat": 0.3,
    },
    "strawberry": {
        "name_cn": "草莓",
        "calories": 32,
        "protein": 0.7,
        "carbs": 7.7,
        "fat": 0.3,
    },
    "orange": {
        "name_cn": "橙子",
        "calories": 47,
        "protein": 0.9,
        "carbs": 12.0,
        "fat": 0.1,
    },
    "grape": {
        "name_cn": "葡萄",
        "calories": 69,
        "protein": 0.7,
        "carbs": 18.0,
        "fat": 0.2,
    },
    "watermelon": {
        "name_cn": "西瓜",
        "calories": 30,
        "protein": 0.6,
        "carbs": 8.0,
        "fat": 0.2,
    },
    "mango": {
        "name_cn": "芒果",
        "calories": 60,
        "protein": 0.8,
        "carbs": 15.0,
        "fat": 0.4,
    },
    "kiwi": {
        "name_cn": "猕猴桃",
        "calories": 61,
        "protein": 1.1,
        "carbs": 15.0,
        "fat": 0.5,
    },
    "pear": {
        "name_cn": "梨",
        "calories": 57,
        "protein": 0.4,
        "carbs": 15.0,
        "fat": 0.1,
    },
    "peach": {
        "name_cn": "桃子",
        "calories": 39,
        "protein": 0.9,
        "carbs": 10.0,
        "fat": 0.3,
    },
    "pineapple": {
        "name_cn": "菠萝",
        "calories": 50,
        "protein": 0.5,
        "carbs": 13.0,
        "fat": 0.1,
    },
    "cherry": {
        "name_cn": "樱桃",
        "calories": 63,
        "protein": 1.1,
        "carbs": 16.0,
        "fat": 0.2,
    },
    # ── Dairy ──────────────────────────────────────────────────────────────
    "yogurt": {
        "name_cn": "酸奶",
        "calories": 59,
        "protein": 3.5,
        "carbs": 5.0,
        "fat": 3.3,
    },
    "milk": {
        "name_cn": "牛奶",
        "calories": 42,
        "protein": 3.4,
        "carbs": 5.0,
        "fat": 1.0,
    },
    "cheese": {
        "name_cn": "奶酪",
        "calories": 402,
        "protein": 25.0,
        "carbs": 1.3,
        "fat": 33.0,
    },
    "greek yogurt": {
        "name_cn": "希腊酸奶",
        "calories": 97,
        "protein": 9.0,
        "carbs": 3.6,
        "fat": 5.0,
    },
    # ── Snacks / Beverages ─────────────────────────────────────────────────
    "mixed nuts": {
        "name_cn": "混合坚果",
        "calories": 607,
        "protein": 20.0,
        "carbs": 21.0,
        "fat": 54.0,
    },
    "dark chocolate": {
        "name_cn": "黑巧克力",
        "calories": 546,
        "protein": 5.0,
        "carbs": 60.0,
        "fat": 31.0,
    },
    "black coffee": {
        "name_cn": "黑咖啡",
        "calories": 2,
        "protein": 0.3,
        "carbs": 0.0,
        "fat": 0.0,
    },
    "bubble tea": {
        "name_cn": "珍珠奶茶",
        "calories": 78,
        "protein": 0.5,
        "carbs": 17.0,
        "fat": 1.2,
    },
    "ice cream": {
        "name_cn": "冰淇淋",
        "calories": 207,
        "protein": 3.5,
        "carbs": 24.0,
        "fat": 11.0,
    },
    "cookie": {
        "name_cn": "饼干",
        "calories": 502,
        "protein": 5.0,
        "carbs": 65.0,
        "fat": 25.0,
    },
    "cake": {
        "name_cn": "蛋糕",
        "calories": 347,
        "protein": 5.0,
        "carbs": 50.0,
        "fat": 15.0,
    },
    # ── Oils / Sauces ──────────────────────────────────────────────────────
    "olive oil": {
        "name_cn": "橄榄油",
        "calories": 884,
        "protein": 0.0,
        "carbs": 0.0,
        "fat": 100.0,
    },
    "soy sauce": {
        "name_cn": "酱油",
        "calories": 53,
        "protein": 5.0,
        "carbs": 5.0,
        "fat": 0.1,
    },
    "oyster sauce": {
        "name_cn": "蚝油",
        "calories": 51,
        "protein": 1.4,
        "carbs": 11.0,
        "fat": 0.3,
    },
    "sesame oil": {
        "name_cn": "香油",
        "calories": 884,
        "protein": 0.0,
        "carbs": 0.0,
        "fat": 100.0,
    },
    "cooking oil": {
        "name_cn": "食用油",
        "calories": 884,
        "protein": 0.0,
        "carbs": 0.0,
        "fat": 100.0,
    },
    "butter": {
        "name_cn": "黄油",
        "calories": 717,
        "protein": 0.9,
        "carbs": 0.1,
        "fat": 81.0,
    },
    "peanut butter": {
        "name_cn": "花生酱",
        "calories": 588,
        "protein": 25.0,
        "carbs": 20.0,
        "fat": 50.0,
    },
}

# ---------------------------------------------------------------------------
# Chinese-name to English-key reverse mapping (built once at import time)
# ---------------------------------------------------------------------------

_CN_TO_EN: dict[str, str] = {
    entry["name_cn"]: key for key, entry in BUILTIN_FOODS.items()
}

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def _ensure_data_dir() -> None:
    """Create the data directory if it does not exist."""
    os.makedirs(DATA_DIR, exist_ok=True)


def _today() -> str:
    """Return today's date as an ISO-format string."""
    return date.today().isoformat()


def load_db() -> dict[str, Any]:
    """Load the food database from disk, initializing it if necessary.

    On first run the database is seeded from BUILTIN_FOODS.  On subsequent
    runs the existing file is loaded as-is so user-learned data is never
    overwritten.

    Returns:
        The parsed database dictionary.
    """
    _ensure_data_dir()

    if os.path.exists(DB_PATH):
        try:
            with open(DB_PATH, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (json.JSONDecodeError, OSError):
            # Corrupted file -- fall through and re-initialize.
            pass

    # First run: seed from built-in data.
    today = _today()
    foods: dict[str, dict[str, Any]] = {}
    for key, entry in BUILTIN_FOODS.items():
        foods[key] = {
            "name_cn": entry["name_cn"],
            "calories": entry["calories"],
            "protein": entry["protein"],
            "carbs": entry["carbs"],
            "fat": entry["fat"],
            "source": "builtin",
            "added_at": today,
        }

    db: dict[str, Any] = {"version": "1.0", "foods": foods}
    _save_db(db)
    return db


def _save_db(db: dict[str, Any]) -> None:
    """Persist the database to disk atomically.

    Writes to a temporary file first, then renames to avoid partial writes.
    """
    _ensure_data_dir()
    tmp_path = DB_PATH + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as fh:
            json.dump(db, fh, ensure_ascii=False, indent=2)
        # Atomic rename (works on POSIX; on Windows it replaces as well in
        # Python 3.3+).
        os.replace(tmp_path, DB_PATH)
    except OSError:
        # Best-effort cleanup of the temp file.
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise


def _db_stats(db: dict[str, Any]) -> dict[str, int]:
    """Return aggregate statistics about the database."""
    foods = db.get("foods", {})
    builtin = sum(1 for f in foods.values() if f.get("source") == "builtin")
    learned = sum(1 for f in foods.values() if f.get("source") != "builtin")
    return {"total": len(foods), "builtin": builtin, "learned": learned}


# ---------------------------------------------------------------------------
# Local search helpers
# ---------------------------------------------------------------------------


def _exact_match(db: dict[str, Any], query: str) -> tuple[str, dict[str, Any]] | None:
    """Try an exact English-key match (case-insensitive)."""
    foods = db.get("foods", {})
    lower = query.lower().strip()
    if lower in foods:
        return lower, foods[lower]
    return None


def _fuzzy_match(
    db: dict[str, Any], query: str
) -> tuple[str, dict[str, Any]] | None:
    """Substring match on both the English key and Chinese name_cn.

    Returns the best (shortest key) match to prefer more specific entries.
    """
    foods = db.get("foods", {})
    lower = query.lower().strip()
    candidates: list[tuple[str, dict[str, Any]]] = []

    for key, entry in foods.items():
        if lower in key or key in lower:
            candidates.append((key, entry))
        elif lower in entry.get("name_cn", ""):
            candidates.append((key, entry))

    if not candidates:
        return None

    # Prefer the shortest key (most specific match).
    candidates.sort(key=lambda c: len(c[0]))
    return candidates[0]


def _search_local(
    db: dict[str, Any], query: str
) -> tuple[str, dict[str, Any]] | None:
    """Search local DB: exact match first, then fuzzy."""
    result = _exact_match(db, query)
    if result:
        return result
    return _fuzzy_match(db, query)


# ---------------------------------------------------------------------------
# Query parsing
# ---------------------------------------------------------------------------

# Patterns that capture an amount in grams and the food name.
_AMOUNT_PATTERNS: list[re.Pattern[str]] = [
    # "200g rice" or "200 g rice"
    re.compile(r"(\d+(?:\.\d+)?)\s*g(?:rams?)?\s+(.+)", re.IGNORECASE),
    # "rice 200g"
    re.compile(r"(.+?)\s+(\d+(?:\.\d+)?)\s*g(?:rams?)?$", re.IGNORECASE),
    # "200 grams of rice"
    re.compile(
        r"(\d+(?:\.\d+)?)\s*grams?\s+of\s+(.+)", re.IGNORECASE
    ),
]


def _parse_item(raw: str) -> tuple[str, float]:
    """Parse a single food item string into (food_name, grams).

    Supports: "200g rice", "rice 200g", "200 grams rice", "rice" (default 100g).

    Returns:
        A tuple of (food_name_lowercase, serving_grams).
    """
    text = raw.strip()
    if not text:
        return ("", 100.0)

    # Pattern 1 & 3: amount first
    for pat in (_AMOUNT_PATTERNS[0], _AMOUNT_PATTERNS[2]):
        m = pat.match(text)
        if m:
            return (m.group(2).strip().lower(), float(m.group(1)))

    # Pattern 2: amount last
    m = _AMOUNT_PATTERNS[1].match(text)
    if m:
        return (m.group(1).strip().lower(), float(m.group(2)))

    # No amount found -- default to 100 g.
    return (text.lower(), 100.0)


def _parse_query(query: str) -> list[tuple[str, float]]:
    """Split a comma-separated query and parse each item.

    Returns:
        List of (food_name, grams) tuples.
    """
    # Split on Chinese or ASCII comma.
    parts = re.split(r"[,，]", query)
    items: list[tuple[str, float]] = []
    for part in parts:
        name, grams = _parse_item(part)
        if name:
            items.append((name, grams))
    return items


# ---------------------------------------------------------------------------
# API Ninjas integration
# ---------------------------------------------------------------------------


def _get_api_key() -> str | None:
    """Retrieve the USDA FoodData Central API key from the environment.

    Falls back to DEMO_KEY (30 req/hour) if no key is configured.
    """
    key = os.environ.get("NANOBOTS_USDA_API_KEY") or os.environ.get("NANOBOTS_NINJAS_API_KEY")
    return key if key else "DEMO_KEY"


def _query_api(
    food_name: str, grams: float, api_key: str
) -> dict[str, Any] | None:
    """Call the USDA FoodData Central search endpoint with one retry on failure.

    Args:
        food_name: The food to query (English).
        grams: Serving size in grams (not used in USDA query, kept for interface compat).
        api_key: The USDA API key (or DEMO_KEY).

    Returns:
        A normalized dict with name/calories/protein/carbs/fat, or None on failure.
    """
    url = "https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {
        "api_key": api_key,
        "query": food_name,
        "pageSize": "3",
        "dataType": "Survey (FNDDS)",
    }

    for attempt in range(2):  # one try + one retry
        try:
            resp = requests.get(url, params=params, timeout=15)
            if resp.status_code == 429:
                return None
            resp.raise_for_status()
            data = resp.json()
            foods = data.get("foods", [])
            if not foods:
                # Retry without dataType filter (fall back to any type)
                if attempt == 0:
                    params.pop("dataType", None)
                    continue
                return None
            return foods[0]
        except (requests.RequestException, ValueError):
            if attempt == 0:
                continue
            return None

    return None


def _normalize_api_item(api_item: dict[str, Any]) -> dict[str, Any]:
    """Normalize a USDA FoodData Central response item to per-100g values.

    USDA Survey (FNDDS) data is already per 100g. Branded data may vary,
    but we treat all as per-100g since the search returns standardized values.

    Returns:
        Dict with keys: name, name_cn, calories, protein, carbs, fat.
    """
    nutrients: dict[str, float] = {}
    for n in api_item.get("foodNutrients", []):
        name = n.get("nutrientName", "")
        value = float(n.get("value", 0))
        nutrients[name] = value

    return {
        "name": api_item.get("description", "unknown").lower(),
        "name_cn": "",
        "calories": round(nutrients.get("Energy", 0), 1),
        "protein": round(nutrients.get("Protein", 0), 1),
        "carbs": round(nutrients.get("Carbohydrate, by difference", 0), 1),
        "fat": round(nutrients.get("Total lipid (fat)", 0), 1),
    }


def _learn_food(db: dict[str, Any], key: str, per100: dict[str, Any]) -> None:
    """Persist a newly-learned food into the database.

    Args:
        db: The in-memory database dict (mutated in place).
        key: The English key under which to store the food.
        per100: Normalized per-100g nutritional data.
    """
    db.setdefault("foods", {})[key] = {
        "name_cn": per100.get("name_cn", ""),
        "calories": per100["calories"],
        "protein": per100["protein"],
        "carbs": per100["carbs"],
        "fat": per100["fat"],
        "source": "api",
        "added_at": _today(),
    }
    _save_db(db)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def _scale(per100: dict[str, Any], grams: float) -> dict[str, float]:
    """Scale per-100g values to the requested serving size.

    Returns:
        Dict with calories, protein_g, carbs_g, fat_g for the given grams.
    """
    factor = grams / 100.0
    return {
        "calories": round(float(per100.get("calories", 0)) * factor, 1),
        "protein_g": round(float(per100.get("protein", 0)) * factor, 1),
        "carbs_g": round(float(per100.get("carbs", 0)) * factor, 1),
        "fat_g": round(float(per100.get("fat", 0)) * factor, 1),
    }


def cmd_lookup(query: str) -> dict[str, Any]:
    """Look up nutrition for a comma-separated list of foods with amounts.

    Args:
        query: e.g. "200g rice, 150g chicken breast, 100g broccoli"

    Returns:
        Result dict with items, totals, and db_stats.
    """
    db = load_db()
    items_parsed = _parse_query(query)
    if not items_parsed:
        return {"status": "error", "message": "No food items found in query."}

    api_key = _get_api_key()
    result_items: list[dict[str, Any]] = []
    totals = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}

    for food_name, grams in items_parsed:
        # --- Try local DB first ------------------------------------------------
        local = _search_local(db, food_name)
        if local is not None:
            key, entry = local
            scaled = _scale(entry, grams)
            result_items.append(
                {
                    "name": key,
                    "name_cn": entry.get("name_cn", ""),
                    "calories": scaled["calories"],
                    "protein_g": scaled["protein_g"],
                    "carbs_g": scaled["carbs_g"],
                    "fat_g": scaled["fat_g"],
                    "serving_size_g": grams,
                    "source": "local",
                }
            )
            for k in totals:
                totals[k] += scaled[k]
            continue

        # --- Try API ----------------------------------------------------------
        if api_key:
            api_item = _query_api(food_name, grams, api_key)
            if api_item is not None:
                per100 = _normalize_api_item(api_item)
                # Learn this food for future lookups.
                learn_key = per100.get("name", food_name).lower().strip()
                _learn_food(db, learn_key, per100)

                scaled = _scale(per100, grams)
                result_items.append(
                    {
                        "name": learn_key,
                        "name_cn": per100.get("name_cn", ""),
                        "calories": scaled["calories"],
                        "protein_g": scaled["protein_g"],
                        "carbs_g": scaled["carbs_g"],
                        "fat_g": scaled["fat_g"],
                        "serving_size_g": grams,
                        "source": "api",
                    }
                )
                for k in totals:
                    totals[k] += scaled[k]
                continue

        # --- Fallback: not found anywhere -------------------------------------
        result_items.append(
            {
                "name": food_name,
                "name_cn": "",
                "calories": 0,
                "protein_g": 0,
                "carbs_g": 0,
                "fat_g": 0,
                "serving_size_g": grams,
                "source": "estimate",
                "message": (
                    f"'{food_name}' not found in local DB and API lookup "
                    "unavailable. Agent should estimate based on similar foods."
                ),
            }
        )

    # Round totals.
    for k in totals:
        totals[k] = round(totals[k], 1)

    return {
        "status": "ok",
        "items": result_items,
        "totals": totals,
        "db_stats": _db_stats(db),
    }


def cmd_search(query: str) -> dict[str, Any]:
    """Search the local DB by English key or Chinese name (substring match).

    Args:
        query: Search term, e.g. "chicken" or "鸡胸肉".

    Returns:
        Result dict with matching entries (per-100g).
    """
    db = load_db()
    foods = db.get("foods", {})
    lower = query.lower().strip()
    matches: list[dict[str, Any]] = []

    for key, entry in foods.items():
        if lower in key or key in lower or lower in entry.get("name_cn", ""):
            matches.append(
                {
                    "name": key,
                    "name_cn": entry.get("name_cn", ""),
                    "calories": entry.get("calories", 0),
                    "protein_g": entry.get("protein", 0),
                    "carbs_g": entry.get("carbs", 0),
                    "fat_g": entry.get("fat", 0),
                    "source": entry.get("source", "builtin"),
                    "per_100g": True,
                }
            )

    return {
        "status": "ok",
        "query": query,
        "count": len(matches),
        "results": matches,
        "db_stats": _db_stats(db),
    }


def cmd_list() -> dict[str, Any]:
    """List all foods in the local database.

    Returns:
        Result dict with every food entry and its source.
    """
    db = load_db()
    foods = db.get("foods", {})
    entries: list[dict[str, Any]] = []

    for key in sorted(foods.keys()):
        entry = foods[key]
        entries.append(
            {
                "name": key,
                "name_cn": entry.get("name_cn", ""),
                "calories": entry.get("calories", 0),
                "protein_g": entry.get("protein", 0),
                "carbs_g": entry.get("carbs", 0),
                "fat_g": entry.get("fat", 0),
                "source": entry.get("source", "builtin"),
            }
        )

    return {
        "status": "ok",
        "count": len(entries),
        "foods": entries,
        "db_stats": _db_stats(db),
    }


def cmd_stats() -> dict[str, Any]:
    """Show database statistics.

    Returns:
        Result dict with counts of total, builtin, and learned foods.
    """
    db = load_db()
    stats = _db_stats(db)
    return {"status": "ok", **stats}


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Parse arguments and dispatch to the appropriate command."""
    parser = argparse.ArgumentParser(
        description="Food Scout -- self-learning nutrition database",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # lookup
    p_lookup = subparsers.add_parser(
        "lookup",
        help="Look up nutrition for foods (e.g. '200g rice, 150g chicken breast')",
    )
    p_lookup.add_argument(
        "query",
        type=str,
        help="Comma-separated list of foods with optional amounts",
    )

    # search
    p_search = subparsers.add_parser(
        "search",
        help="Search local DB by name (English or Chinese)",
    )
    p_search.add_argument("query", type=str, help="Search term")

    # list
    subparsers.add_parser("list", help="List all foods in the database")

    # stats
    subparsers.add_parser("stats", help="Show database statistics")

    args = parser.parse_args()

    try:
        match args.command:
            case "lookup":
                result = cmd_lookup(args.query)
            case "search":
                result = cmd_search(args.query)
            case "list":
                result = cmd_list()
            case "stats":
                result = cmd_stats()
            case _:
                result = {"status": "error", "message": f"Unknown command: {args.command}"}
    except Exception as exc:
        result = {"status": "error", "message": str(exc)}

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

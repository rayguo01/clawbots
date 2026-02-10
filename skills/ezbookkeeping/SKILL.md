---
name: ezbookkeeping
description: "财务记账。用户提到花了多少钱、收入多少、查账单、查开销统计时使用。关键词：花了、块钱、元、收入、工资、开销、账单。Keywords: expense, income, spending, budget, bookkeeping, how much did I spend, cost, money tracker."
homepage: https://github.com/mayswind/ezbookkeeping
metadata:
  {
    "openclaw":
      {
        "emoji": "💰",
        "requires": { "plugins": ["ezbookkeeping"], "env": ["NANOBOTS_EZBOOKKEEPING_SECRET"] },
      },
  }
---

# ezBookkeeping

Natural language bookkeeping powered by ezBookkeeping. Users simply say what they spent or earned, and the system automatically records it.

## How It Works

- Each chat user gets an **auto-created** ezBookkeeping account (no signup needed)
- Accounts are identified by `sessionKey` (e.g. `telegram:123456`)
- Passwords are derived via HMAC-SHA256 — deterministic, never stored in plaintext
- Default categories (餐饮, 交通, 购物, etc.) are created on first use

## Available Tools

| Tool                      | Description          | Example Trigger                      |
| ------------------------- | -------------------- | ------------------------------------ |
| `bookkeeping_add_expense` | Record a spending    | "午饭花了15块", "taxi $30"           |
| `bookkeeping_add_income`  | Record an earning    | "收到工资8000", "bonus 500"          |
| `bookkeeping_list`        | Query transactions   | "最近的开销", "this week's spending" |
| `bookkeeping_stats`       | Summary statistics   | "这个月花了多少", "monthly report"   |
| `bookkeeping_categories`  | List categories      | "有哪些分类"                         |
| `bookkeeping_accounts`    | List accounts        | "我的账户"                           |
| `bookkeeping_delete`      | Delete a transaction | "删掉上一笔"                         |

## Currency Selection

On the **first** transaction for a new user, pass the `currency` parameter (ISO 4217 code) based on the user's timezone or locale:

| Timezone                          | Currency |
| --------------------------------- | -------- |
| Asia/Singapore                    | SGD      |
| Asia/Shanghai, Asia/Hong_Kong     | CNY      |
| America/New_York, America/Chicago | USD      |
| Europe/London                     | GBP      |
| Europe/Paris, Europe/Berlin       | EUR      |
| Asia/Tokyo                        | JPY      |
| Asia/Kuala_Lumpur                 | MYR      |
| Asia/Bangkok                      | THB      |
| Asia/Seoul                        | KRW      |
| Asia/Taipei                       | TWD      |
| Australia/Sydney                  | AUD      |

If the user mentions a specific currency (e.g. "spent 20 USD"), use that instead.

## Category Matching

- Tools accept `categoryName` as a string (e.g. "餐饮", "交通")
- The system does fuzzy matching: exact first, then substring
- If no match is found, the error message lists all available categories — use `bookkeeping_categories` to show them to the user

## Amount Handling

- Users input amounts in normal currency units (e.g. 15.5 means 15.50)
- The system converts to cents internally (15.5 → 1550)

## Configuration

Environment variables (set in `docker-compose.yml`):

| Variable                          | Default                     | Description                         |
| --------------------------------- | --------------------------- | ----------------------------------- |
| `NANOBOTS_EZBOOKKEEPING_URL`      | `http://ezbookkeeping:8080` | ezBookkeeping server URL            |
| `NANOBOTS_EZBOOKKEEPING_SECRET`   | `nanobots-ezb-secret`       | HMAC secret for password derivation |
| `NANOBOTS_EZBOOKKEEPING_CURRENCY` | `SGD`                       | Fallback default currency           |

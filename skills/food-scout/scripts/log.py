#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""食探 (Food Scout) - 每日饮食记录"""

import argparse
import json
import os
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')

MACRO_KEYS = ('calories', 'protein_g', 'carbs_g', 'fat_g')


def _ensure_data_dir() -> str:
    os.makedirs(DATA_DIR, exist_ok=True)
    return DATA_DIR


def _today_str() -> str:
    return datetime.now().strftime('%Y-%m-%d')


def _log_path(date_str: str | None = None) -> str:
    _ensure_data_dir()
    return os.path.join(DATA_DIR, f'log-{date_str or _today_str()}.json')


def _weight_path() -> str:
    _ensure_data_dir()
    return os.path.join(DATA_DIR, 'weight.json')


def _load_json(path: str, default: dict) -> dict:
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return default


def _save_json(path: str, data: dict) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _out(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _load_log(date_str: str | None = None) -> dict:
    ds = date_str or _today_str()
    return _load_json(_log_path(ds), {'date': ds, 'meals': []})


def _save_log(log: dict, date_str: str | None = None) -> None:
    _save_json(_log_path(date_str), log)


def _sum_macros(items: list[dict]) -> dict:
    return {k: sum(it.get(k, 0) for it in items) for k in MACRO_KEYS}


def _day_totals(log: dict) -> dict:
    meals = log.get('meals', [])
    combined = {k: 0 for k in MACRO_KEYS}
    for meal in meals:
        for k in MACRO_KEYS:
            combined[k] += meal.get('totals', {}).get(k, 0)
    combined['meal_count'] = len(meals)
    return combined


# ── Commands ─────────────────────────────────────────────────────────


def cmd_add(args: argparse.Namespace) -> None:
    log = _load_log()
    items = json.loads(args.items) if args.items else []
    totals = _sum_macros(items)

    log['meals'].append({
        'type': args.meal,
        'time': datetime.now().strftime('%H:%M'),
        'items': items,
        'totals': totals,
        'note': args.note or '',
        'photo': args.photo or '',
    })
    _save_log(log)

    day = _day_totals(log)
    _out({
        'status': 'ok',
        'meal': args.meal,
        'meal_calories': totals['calories'],
        'meal_protein': totals['protein_g'],
        'day_so_far': {
            'calories': day['calories'],
            'protein_g': day['protein_g'],
            'carbs_g': day['carbs_g'],
            'fat_g': day['fat_g'],
            'meals': day['meal_count'],
        },
    })


def cmd_today(_args: argparse.Namespace) -> None:
    log = _load_log()
    _out({
        'date': log.get('date', _today_str()),
        'meals': [
            {
                'type': m['type'],
                'time': m.get('time', ''),
                'note': m.get('note', ''),
                'photo': m.get('photo', ''),
                'calories': m.get('totals', {}).get('calories', 0),
                'protein_g': m.get('totals', {}).get('protein_g', 0),
                'carbs_g': m.get('totals', {}).get('carbs_g', 0),
                'fat_g': m.get('totals', {}).get('fat_g', 0),
            }
            for m in log.get('meals', [])
        ],
        'totals': _day_totals(log),
    })


def cmd_week(_args: argparse.Namespace) -> None:
    days = []
    for i in range(7):
        ds = (datetime.now() - timedelta(days=6 - i)).strftime('%Y-%m-%d')
        totals = _day_totals(_load_log(ds))
        days.append({
            'date': ds,
            'calories': totals['calories'],
            'protein_g': totals['protein_g'],
            'carbs_g': totals['carbs_g'],
            'fat_g': totals['fat_g'],
            'meals': totals['meal_count'],
        })

    active = [d for d in days if d['meals'] > 0]
    total_cal = sum(d['calories'] for d in days)
    _out({
        'days': days,
        'summary': {
            'total_calories': total_cal,
            'active_days': len(active),
            'avg_daily_calories': round(total_cal / len(active)) if active else 0,
        },
    })


def cmd_delete(args: argparse.Namespace) -> None:
    log = _load_log()
    meals = log.get('meals', [])
    idx = args.index

    if not (0 <= idx < len(meals)):
        _out({'status': 'error', 'message': f'Index {idx} out of range (0-{len(meals) - 1})'})
        return

    removed = meals.pop(idx)
    _save_log(log)
    _out({'status': 'ok', 'removed': removed.get('type', ''), 'note': removed.get('note', '')})


def cmd_weight(args: argparse.Namespace) -> None:
    data = _load_json(_weight_path(), {'records': []})
    today = _today_str()
    records: list[dict] = data['records']

    # Update existing or append new
    existing = next((r for r in records if r['date'] == today), None)
    if existing:
        existing['kg'] = args.kg
    else:
        records.append({'date': today, 'kg': args.kg})

    records.sort(key=lambda r: r['date'])
    _save_json(_weight_path(), data)

    result: dict = {'status': 'ok', 'date': today, 'kg': args.kg}

    # Compare with previous record
    today_idx = next(i for i, r in enumerate(records) if r['date'] == today)
    if today_idx > 0:
        prev = records[today_idx - 1]
        result['prev_date'] = prev['date']
        result['prev_kg'] = prev['kg']
        result['change'] = round(args.kg - prev['kg'], 1)

    _out(result)


def cmd_weight_trend(_args: argparse.Namespace) -> None:
    data = _load_json(_weight_path(), {'records': []})
    records: list[dict] = data.get('records', [])

    if not records:
        _out({'status': 'ok', 'message': 'No weight records yet'})
        return

    result: dict = {
        'total_records': len(records),
        'first': records[0],
        'latest': records[-1],
        'records': records[-10:],
    }

    if len(records) >= 2:
        result['total_change'] = round(records[-1]['kg'] - records[0]['kg'], 1)

        cutoff = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        recent = [r for r in records if r['date'] >= cutoff]
        if recent:
            result['month_avg'] = round(sum(r['kg'] for r in recent) / len(recent), 1)

    last_date = datetime.strptime(records[-1]['date'], '%Y-%m-%d')
    result['days_since_last'] = (datetime.now() - last_date).days

    _out(result)


# ── CLI ──────────────────────────────────────────────────────────────

COMMANDS = {
    'add': cmd_add,
    'today': cmd_today,
    'week': cmd_week,
    'delete': cmd_delete,
    'weight': cmd_weight,
    'weight-trend': cmd_weight_trend,
}


def main() -> None:
    parser = argparse.ArgumentParser(description='食探 - 饮食记录')
    sub = parser.add_subparsers(dest='cmd')

    p_add = sub.add_parser('add')
    p_add.add_argument('--meal', required=True,
                       choices=['breakfast', 'lunch', 'dinner', 'snack'])
    p_add.add_argument('--items', required=True, help='JSON array of food items')
    p_add.add_argument('--note', default='')
    p_add.add_argument('--photo', default='')

    sub.add_parser('today')
    sub.add_parser('week')

    p_del = sub.add_parser('delete')
    p_del.add_argument('--index', type=int, required=True)

    p_wt = sub.add_parser('weight')
    p_wt.add_argument('--kg', type=float, required=True)

    sub.add_parser('weight-trend')

    args = parser.parse_args()
    handler = COMMANDS.get(args.cmd)
    if handler:
        handler(args)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()

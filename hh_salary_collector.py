#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


API_BASE = "https://api.hh.ru"
DEFAULT_DB = "hh_salary.sqlite"


def now_utc_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def connect_db(path):
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS salary_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resume_id TEXT NOT NULL,
            salary_amount INTEGER,
            salary_currency TEXT,
            age INTEGER,
            resume_updated_at TEXT,
            found_at TEXT NOT NULL,
            search_query TEXT,
            area TEXT,
            page INTEGER,
            access_basis TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'hh_api',
            raw_item TEXT NOT NULL,
            UNIQUE (resume_id, search_query, area, resume_updated_at)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_salary_observations_found_at
        ON salary_observations(found_at)
        """
    )
    return conn


def request_json(path, token, params=None):
    url = f"{API_BASE}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params, doseq=True)}"

    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "HH-User-Agent": "hh-salary-collector/0.1",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HH API returned {error.code}: {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach HH API: {error.reason}") from error


def extract_salary(item):
    salary = item.get("salary")
    if not isinstance(salary, dict):
        return None, None

    amount = salary.get("amount")
    if amount is None:
        amount = salary.get("from") or salary.get("to")

    currency = salary.get("currency")
    if isinstance(currency, dict):
        currency = currency.get("code") or currency.get("abbr")

    return amount, currency


def extract_updated_at(item):
    return (
        item.get("updated_at")
        or item.get("updated")
        or item.get("last_update")
        or item.get("created_at")
    )


def save_items(conn, items, *, found_at, text, area, page, access_basis):
    inserted = 0
    skipped_without_salary = 0

    for item in items:
        resume_id = item.get("id")
        if not resume_id:
            continue

        salary_amount, salary_currency = extract_salary(item)
        if salary_amount is None:
            skipped_without_salary += 1
            continue

        try:
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO salary_observations (
                    resume_id,
                    salary_amount,
                    salary_currency,
                    age,
                    resume_updated_at,
                    found_at,
                    search_query,
                    area,
                    page,
                    access_basis,
                    raw_item
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    resume_id,
                    salary_amount,
                    salary_currency,
                    item.get("age"),
                    extract_updated_at(item),
                    found_at,
                    text,
                    area,
                    page,
                    access_basis,
                    json.dumps(item, ensure_ascii=False, sort_keys=True),
                ),
            )
            if cursor.rowcount:
                inserted += 1
        except sqlite3.Error as error:
            print(f"Could not save resume {resume_id}: {error}", file=sys.stderr)

    conn.commit()
    return inserted, skipped_without_salary


def collect(args):
    token = os.environ.get("HH_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("Set HH_ACCESS_TOKEN before running the collector.")

    conn = connect_db(args.db)
    total_inserted = 0
    total_seen = 0
    total_skipped_without_salary = 0

    for page in range(args.pages):
        params = {
            "text": args.text,
            "page": page,
            "per_page": args.per_page,
        }
        if args.area:
            params["area"] = args.area
        if args.order_by:
            params["order_by"] = args.order_by

        data = request_json("/resumes", token, params)
        items = data.get("items", [])
        total_seen += len(items)

        inserted, skipped_without_salary = save_items(
            conn,
            items,
            found_at=now_utc_iso(),
            text=args.text,
            area=args.area,
            page=page,
            access_basis=args.access_basis,
        )
        total_inserted += inserted
        total_skipped_without_salary += skipped_without_salary

        print(
            f"page={page + 1} seen={len(items)} saved={inserted} "
            f"without_salary={skipped_without_salary}"
        )

        if page + 1 >= data.get("pages", 0):
            break
        if page + 1 < args.pages:
            time.sleep(args.delay)

    print(
        f"done: seen={total_seen} saved={total_inserted} "
        f"without_salary={total_skipped_without_salary} db={args.db}"
    )


def show_rows(args):
    conn = connect_db(args.db)
    rows = conn.execute(
        """
        SELECT found_at, salary_amount, salary_currency, age, resume_updated_at, search_query, resume_id
        FROM salary_observations
        ORDER BY found_at DESC, id DESC
        LIMIT ?
        """,
        (args.show,),
    ).fetchall()

    for row in rows:
        print(
            " | ".join("" if value is None else str(value) for value in row)
        )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Collect salary observations from HH API into SQLite."
    )
    parser.add_argument("--db", default=DEFAULT_DB, help="SQLite database path.")
    parser.add_argument("--text", help="Resume search text.")
    parser.add_argument("--area", help="HH area id, for example 1 for Moscow.")
    parser.add_argument("--pages", type=int, default=1, help="How many pages to request.")
    parser.add_argument("--per-page", type=int, default=50, help="Items per API page.")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay between API requests.")
    parser.add_argument("--order-by", default="publication_time", help="HH resume search ordering.")
    parser.add_argument(
        "--access-basis",
        default="authorized_api_access",
        help="Why this account is allowed to process these records.",
    )
    parser.add_argument("--show", type=int, help="Show recent rows instead of collecting.")
    args = parser.parse_args()

    if args.show is None and not args.text:
        parser.error("--text is required unless --show is used")
    if args.pages < 1:
        parser.error("--pages must be at least 1")
    if args.per_page < 1 or args.per_page > 100:
        parser.error("--per-page must be between 1 and 100")

    return args


def main():
    args = parse_args()
    try:
        if args.show is not None:
            show_rows(args)
        else:
            collect(args)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

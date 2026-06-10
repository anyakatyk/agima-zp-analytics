#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import sqlite3
from pathlib import Path

import salary_metrics


DEFAULT_METRICS_DB = "salary_metrics.sqlite"

FREQUENCY_DAYS = {
    "week": 7,
    "month": 30,
    "quarter": 90,
    "half_year": 182,
    "year": 365,
}


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def iso(value):
    if value is None:
        return None
    return value.isoformat(timespec="seconds")


def parse_iso(value):
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = dt.datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def next_run_after(frequency, base=None):
    if frequency not in FREQUENCY_DAYS:
        return None
    start = base or now_utc()
    return start + dt.timedelta(days=FREQUENCY_DAYS[frequency])


def connect(path):
    salary_metrics.connect_metrics_db(path).close()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    ensure_schema(conn)
    return conn


def ensure_column(conn, table, column, sql):
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        conn.execute(sql)


def ensure_schema(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS hh_searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            name TEXT NOT NULL,
            query TEXT NOT NULL,
            role TEXT NOT NULL,
            role_mode TEXT NOT NULL DEFAULT 'existing',
            workshop TEXT,
            sub_workshop TEXT,
            location TEXT NOT NULL DEFAULT 'Москва',
            area TEXT NOT NULL DEFAULT '1',
            grade TEXT NOT NULL DEFAULT 'all',
            stack TEXT,
            pages INTEGER NOT NULL DEFAULT 1,
            subscription_enabled INTEGER NOT NULL DEFAULT 0,
            frequency TEXT,
            next_run_at TEXT,
            last_run_at TEXT,
            active INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS metric_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            period TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            role TEXT NOT NULL,
            location TEXT NOT NULL,
            grade TEXT NOT NULL,
            stack TEXT NOT NULL,
            source_system TEXT NOT NULL DEFAULT 'hh_api',
            search_id INTEGER,
            workshop TEXT,
            sub_workshop TEXT,
            source_db TEXT NOT NULL,
            source_query TEXT,
            notes TEXT
        )
        """
    )
    ensure_column(conn, "metric_snapshots", "search_id", "ALTER TABLE metric_snapshots ADD COLUMN search_id INTEGER")
    ensure_column(conn, "metric_snapshots", "workshop", "ALTER TABLE metric_snapshots ADD COLUMN workshop TEXT")
    ensure_column(conn, "metric_snapshots", "sub_workshop", "ALTER TABLE metric_snapshots ADD COLUMN sub_workshop TEXT")
    ensure_column(conn, "metric_snapshots", "source_system", "ALTER TABLE metric_snapshots ADD COLUMN source_system TEXT NOT NULL DEFAULT 'hh_api'")
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_metric_snapshots_search_id
        ON metric_snapshots(search_id)
        """
    )


def row_to_dict(row):
    return {key: row[key] for key in row.keys()}


def clean(value, fallback=""):
    if value is None:
        return fallback
    value = str(value).strip()
    return value if value else fallback


def save_search(args):
    conn = connect(args.metrics_db)
    created = now_utc()
    enabled = 1 if args.subscription_enabled else 0
    frequency = args.frequency if enabled else None
    next_run_at = iso(next_run_after(frequency, created)) if enabled else None
    pages = max(1, min(args.pages, 10))
    name = clean(args.name) or clean(args.role) or clean(args.query)

    if args.search_id:
        existing = conn.execute("SELECT created_at FROM hh_searches WHERE id = ?", (args.search_id,)).fetchone()
        if not existing:
            raise SystemExit(f"Search #{args.search_id} not found.")
        conn.execute(
            """
            UPDATE hh_searches
            SET updated_at = ?, name = ?, query = ?, role = ?, role_mode = ?,
                workshop = ?, sub_workshop = ?, location = ?, area = ?, grade = ?,
                stack = ?, pages = ?, subscription_enabled = ?, frequency = ?,
                next_run_at = CASE
                    WHEN ? = 1 AND (next_run_at IS NULL OR frequency IS NULL OR frequency != ?)
                    THEN ?
                    WHEN ? = 0 THEN NULL
                    ELSE next_run_at
                END,
                active = 1
            WHERE id = ?
            """,
            (
                iso(created),
                name,
                clean(args.query),
                clean(args.role) or clean(args.query),
                clean(args.role_mode, "existing"),
                clean(args.workshop),
                clean(args.sub_workshop),
                clean(args.location, "Москва"),
                clean(args.area, "1"),
                clean(args.grade, "all"),
                clean(args.stack),
                pages,
                enabled,
                frequency,
                enabled,
                frequency,
                next_run_at,
                enabled,
                args.search_id,
            ),
        )
        search_id = args.search_id
    else:
        cursor = conn.execute(
            """
            INSERT INTO hh_searches (
                created_at, updated_at, name, query, role, role_mode, workshop,
                sub_workshop, location, area, grade, stack, pages,
                subscription_enabled, frequency, next_run_at, active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                iso(created),
                iso(created),
                name,
                clean(args.query),
                clean(args.role) or clean(args.query),
                clean(args.role_mode, "existing"),
                clean(args.workshop),
                clean(args.sub_workshop),
                clean(args.location, "Москва"),
                clean(args.area, "1"),
                clean(args.grade, "all"),
                clean(args.stack),
                pages,
                enabled,
                frequency,
                next_run_at,
            ),
        )
        search_id = cursor.lastrowid

    conn.commit()
    print(json.dumps({"ok": True, "search": get_search(conn, search_id)}, ensure_ascii=False))


def get_search(conn, search_id):
    row = conn.execute("SELECT * FROM hh_searches WHERE id = ?", (search_id,)).fetchone()
    if not row:
        return None
    return row_to_dict(row)


def snapshot_summary(conn, snapshot_id):
    row = conn.execute(
        """
        SELECT observations_count, salary_min, salary_p25, salary_median,
               salary_avg, salary_p75, salary_max
        FROM salary_metric_groups
        WHERE snapshot_id = ? AND group_type = 'overall' AND group_value = 'all'
        """,
        (snapshot_id,),
    ).fetchone()
    if not row:
        return None
    return {
        "observations": row["observations_count"],
        "min": row["salary_min"],
        "p25": row["salary_p25"],
        "median": row["salary_median"],
        "average": row["salary_avg"],
        "p75": row["salary_p75"],
        "max": row["salary_max"],
    }


def build_snapshot_where(args, alias="s"):
    params = []
    where = [f"{alias}.source_system = 'hh_api'"]
    if getattr(args, "search_id", None):
        where.append(f"{alias}.search_id = ?")
        params.append(args.search_id)
    if getattr(args, "search_ids", None):
        ids = [int(item) for item in args.search_ids.split(",") if item.strip()]
        if ids:
            where.append(f"{alias}.search_id IN ({','.join('?' for _ in ids)})")
            params.extend(ids)
    if getattr(args, "snapshot_ids", None):
        ids = [int(item) for item in args.snapshot_ids.split(",") if item.strip()]
        if ids:
            where.append(f"{alias}.id IN ({','.join('?' for _ in ids)})")
            params.extend(ids)
    if getattr(args, "role", None):
        where.append(f"{alias}.role = ?")
        params.append(args.role)
    if getattr(args, "grade", None):
        where.append(f"{alias}.grade = ?")
        params.append(args.grade)
    if getattr(args, "stack", None):
        where.append(f"{alias}.stack = ?")
        params.append(args.stack)
    if getattr(args, "location", None):
        where.append(f"{alias}.location = ?")
        params.append(args.location)
    if getattr(args, "workshop", None):
        where.append(f"{alias}.workshop = ?")
        params.append(args.workshop)
    if getattr(args, "sub_workshop", None):
        where.append(f"{alias}.sub_workshop = ?")
        params.append(args.sub_workshop)
    if getattr(args, "from_date", None):
        where.append(f"substr({alias}.created_at, 1, 10) >= ?")
        params.append(args.from_date)
    if getattr(args, "to_date", None):
        where.append(f"substr({alias}.created_at, 1, 10) <= ?")
        params.append(args.to_date)
    return where, params


def list_data(args):
    conn = connect(args.metrics_db)
    search_params = []
    search_where = ["active = 1"]
    if args.search_id:
        search_where.append("id = ?")
        search_params.append(args.search_id)

    searches = [
        row_to_dict(row)
        for row in conn.execute(
            f"""
            SELECT * FROM hh_searches
            WHERE {" AND ".join(search_where)}
            ORDER BY updated_at DESC, id DESC
            """,
            search_params,
        )
    ]

    snapshot_args = argparse.Namespace(**vars(args))
    snapshot_args.grade = None
    snapshot_where, snapshot_params = build_snapshot_where(snapshot_args, "s")
    if args.grade:
        snapshot_where.append(
            "EXISTS (SELECT 1 FROM salary_metric_observations o WHERE o.snapshot_id = s.id AND o.grade = ?)"
        )
        snapshot_params.append(args.grade)

    snapshots = []
    for row in conn.execute(
        f"""
        SELECT
            s.*,
            h.name AS search_name,
            h.subscription_enabled,
            h.frequency,
            h.next_run_at
        FROM metric_snapshots s
        LEFT JOIN hh_searches h ON h.id = s.search_id
        WHERE {" AND ".join(snapshot_where)}
        ORDER BY s.id DESC
        LIMIT ?
        """,
        snapshot_params + [args.limit],
    ):
        item = row_to_dict(row)
        item["summary"] = snapshot_summary(conn, row["id"])
        snapshots.append(item)

    filter_options = get_filter_options(conn, args)

    print(json.dumps({
        "ok": True,
        "searches": searches,
        "snapshots": snapshots,
        "filterOptions": filter_options,
    }, ensure_ascii=False))


def get_filter_options(conn, args):
    role_args = argparse.Namespace(**vars(args))
    role_args.role = None
    role_args.grade = None
    role_args.snapshot_ids = None
    role_args.search_ids = None
    role_where, role_params = build_snapshot_where(role_args, "s")
    roles = [
        row["role"]
        for row in conn.execute(
            f"""
            SELECT DISTINCT s.role
            FROM metric_snapshots s
            WHERE {" AND ".join(role_where)} AND s.role IS NOT NULL AND s.role != ''
            ORDER BY s.role
            """,
            role_params,
        )
    ]

    grade_args = argparse.Namespace(**vars(args))
    grade_args.grade = None
    grade_args.snapshot_ids = None
    grade_args.search_ids = None
    grade_where, grade_params = build_snapshot_where(grade_args, "s")
    grades = [
        row["grade"]
        for row in conn.execute(
            f"""
            SELECT DISTINCT o.grade
            FROM salary_metric_observations o
            JOIN metric_snapshots s ON s.id = o.snapshot_id
            WHERE {" AND ".join(grade_where)} AND o.grade IS NOT NULL AND o.grade != ''
            ORDER BY o.grade
            """,
            grade_params,
        )
    ]

    workshops = [
        row["workshop"]
        for row in conn.execute(
            f"""
            SELECT DISTINCT s.workshop
            FROM metric_snapshots s
            WHERE {" AND ".join(role_where)} AND s.workshop IS NOT NULL AND s.workshop != ''
            ORDER BY s.workshop
            """,
            role_params,
        )
    ]

    sub_workshop_args = argparse.Namespace(**vars(args))
    sub_workshop_args.sub_workshop = None
    sub_workshop_args.snapshot_ids = None
    sub_workshop_args.search_ids = None
    sub_workshop_where, sub_workshop_params = build_snapshot_where(sub_workshop_args, "s")
    sub_workshops = [
        row["sub_workshop"]
        for row in conn.execute(
            f"""
            SELECT DISTINCT s.sub_workshop
            FROM metric_snapshots s
            WHERE {" AND ".join(sub_workshop_where)} AND s.sub_workshop IS NOT NULL AND s.sub_workshop != ''
            ORDER BY s.sub_workshop
            """,
            sub_workshop_params,
        )
    ]

    cut_args = argparse.Namespace(**vars(args))
    cut_args.snapshot_ids = None
    cut_args.search_ids = None
    cut_args.grade = None
    cut_where, cut_params = build_snapshot_where(cut_args, "s")
    if args.grade:
        cut_where.append(
            "EXISTS (SELECT 1 FROM salary_metric_observations o WHERE o.snapshot_id = s.id AND o.grade = ?)"
        )
        cut_params.append(args.grade)
    cuts = [
        row_to_dict(row)
        for row in conn.execute(
            f"""
            SELECT s.id, s.created_at, s.role, s.grade, s.search_id, COALESCE(h.name, s.role) AS search_name
            FROM metric_snapshots s
            LEFT JOIN hh_searches h ON h.id = s.search_id
            WHERE {" AND ".join(cut_where)}
            ORDER BY s.created_at DESC, s.id DESC
            """,
            cut_params,
        )
    ]

    return {
        "roles": roles,
        "grades": grades,
        "workshops": workshops,
        "subWorkshops": sub_workshops,
        "cuts": cuts,
    }


def birthdate_to_age(value):
    if not value:
        return None
    born = dt.date.fromisoformat(value)
    today = dt.date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def group_key_sql(group_type):
    mapping = {
        "overall": "'all'",
        "location": "o.location",
        "role": "o.role",
        "source_system": "o.source_system",
        "workshop": "COALESCE(o.workshop, 'unknown')",
        "sub_workshop": "COALESCE(o.sub_workshop, 'unknown')",
        "grade": "o.grade",
        "stack": "CASE WHEN o.stack IS NULL OR o.stack = '' THEN 'not_set' ELSE o.stack END",
        "age_bucket": "o.age_bucket",
        "employment_form": "CASE WHEN o.employment_form IS NULL OR o.employment_form = '' THEN 'unknown' ELSE o.employment_form END",
        "viewed": "CASE WHEN o.viewed = 1 THEN 'viewed' ELSE 'not_viewed' END",
        "favorited": "CASE WHEN o.favorited = 1 THEN 'favorited' ELSE 'not_favorited' END",
        "marked": "CASE WHEN o.marked = 1 THEN 'marked' ELSE 'not_marked' END",
        "resume_updated_month": "substr(COALESCE(o.resume_updated_at, 'unknown'), 1, 7)",
    }
    return mapping.get(group_type, mapping["role"])


def list_groups(args):
    conn = connect(args.metrics_db)
    group_args = argparse.Namespace(**vars(args))
    group_args.grade = None
    snapshot_where, params = build_snapshot_where(group_args, "s")
    observation_where = list(snapshot_where)
    if args.grade:
        observation_where.append("o.grade = ?")
        params.append(args.grade)
    if args.birth_date_from:
        max_age = birthdate_to_age(args.birth_date_from)
        observation_where.append("o.age IS NOT NULL AND o.age <= ?")
        params.append(max_age)
    if args.birth_date_to:
        min_age = birthdate_to_age(args.birth_date_to)
        observation_where.append("o.age IS NOT NULL AND o.age >= ?")
        params.append(min_age)

    group_type = args.group_type or "role"
    group_expr = group_key_sql(group_type)

    rows = conn.execute(
        f"""
        SELECT
            s.id AS snapshot_id,
            s.search_id,
            COALESCE(h.name, s.role) AS search_name,
            s.created_at,
            s.role,
            s.location,
            s.grade,
            s.stack,
            s.workshop,
            s.sub_workshop,
            {group_expr} AS group_value,
            o.salary_amount
        FROM salary_metric_observations o
        JOIN metric_snapshots s ON s.id = o.snapshot_id
        LEFT JOIN hh_searches h ON h.id = s.search_id
        WHERE {" AND ".join(observation_where)}
        ORDER BY s.created_at DESC, s.id DESC
        """,
        params,
    ).fetchall()

    buckets = {}
    meta = {}
    for row in rows:
        item = row_to_dict(row)
        key = (
            item["search_id"],
            item["search_name"],
            item["role"],
            item["location"],
            item["grade"],
            item["stack"],
            item["workshop"],
            item["sub_workshop"],
            item["group_value"],
        )
        buckets.setdefault(key, []).append(item["salary_amount"])
        meta.setdefault(key, item)

    result = []
    for key, values in buckets.items():
        item = meta[key]
        calculated = salary_metrics.stats(values)
        result.append({
            "snapshot_id": None,
            "search_id": item["search_id"],
            "search_name": item["search_name"],
            "created_at": item["created_at"],
            "role": item["role"],
            "location": item["location"],
            "grade": item["grade"],
            "stack": item["stack"],
            "workshop": item["workshop"],
            "sub_workshop": item["sub_workshop"],
            "group_type": group_type,
            "group_value": item["group_value"],
            "observations_count": calculated["count"],
            "salary_min": calculated["min"],
            "salary_p25": calculated["p25"],
            "salary_median": calculated["median"],
            "salary_avg": calculated["avg"],
            "salary_p75": calculated["p75"],
            "salary_max": calculated["max"],
        })

    result.sort(key=lambda item: (-item["observations_count"], str(item["group_value"])))
    print(json.dumps({"ok": True, "groups": result}, ensure_ascii=False))


def delete_snapshot(args):
    conn = connect(args.metrics_db)
    snapshot = conn.execute("SELECT id FROM metric_snapshots WHERE id = ?", (args.snapshot_id,)).fetchone()
    if not snapshot:
        print(json.dumps({"ok": True, "deleted": False}, ensure_ascii=False))
        return
    conn.execute("DELETE FROM salary_metric_groups WHERE snapshot_id = ?", (args.snapshot_id,))
    conn.execute("DELETE FROM salary_metric_observations WHERE snapshot_id = ?", (args.snapshot_id,))
    conn.execute("DELETE FROM metric_snapshots WHERE id = ?", (args.snapshot_id,))
    conn.commit()
    print(json.dumps({"ok": True, "deleted": True, "snapshotId": args.snapshot_id}, ensure_ascii=False))


def due_searches(args):
    conn = connect(args.metrics_db)
    as_of = parse_iso(args.as_of) or now_utc()
    rows = conn.execute(
        """
        SELECT * FROM hh_searches
        WHERE active = 1
          AND subscription_enabled = 1
          AND frequency IS NOT NULL
          AND (next_run_at IS NULL OR next_run_at <= ?)
        ORDER BY COALESCE(next_run_at, created_at), id
        LIMIT ?
        """,
        (iso(as_of), args.limit),
    ).fetchall()
    print(json.dumps({"ok": True, "searches": [row_to_dict(row) for row in rows]}, ensure_ascii=False))


def mark_run(args):
    conn = connect(args.metrics_db)
    current = now_utc()
    search = get_search(conn, args.search_id)
    if not search:
        raise SystemExit(f"Search #{args.search_id} not found.")
    next_at = None
    if search["subscription_enabled"] and search["frequency"]:
        next_at = iso(next_run_after(search["frequency"], current))
    conn.execute(
        """
        UPDATE hh_searches
        SET updated_at = ?, last_run_at = ?, next_run_at = ?
        WHERE id = ?
        """,
        (iso(current), iso(current), next_at, args.search_id),
    )
    conn.commit()
    print(json.dumps({"ok": True, "search": get_search(conn, args.search_id)}, ensure_ascii=False))


def parse_args():
    parser = argparse.ArgumentParser(description="Manage saved HH salary searches.")
    parser.add_argument("--metrics-db", default=DEFAULT_METRICS_DB)
    subparsers = parser.add_subparsers(dest="command", required=True)

    save = subparsers.add_parser("save")
    save.add_argument("--search-id", type=int)
    save.add_argument("--name")
    save.add_argument("--query", required=True)
    save.add_argument("--role", required=True)
    save.add_argument("--role-mode", default="existing")
    save.add_argument("--workshop")
    save.add_argument("--sub-workshop")
    save.add_argument("--location", default="Москва")
    save.add_argument("--area", default="1")
    save.add_argument("--grade", default="all")
    save.add_argument("--stack")
    save.add_argument("--pages", type=int, default=1)
    save.add_argument("--subscription-enabled", action="store_true")
    save.add_argument("--frequency", choices=sorted(FREQUENCY_DAYS.keys()))
    save.set_defaults(func=save_search)

    list_cmd = subparsers.add_parser("list")
    list_cmd.add_argument("--search-id", type=int)
    list_cmd.add_argument("--role")
    list_cmd.add_argument("--grade")
    list_cmd.add_argument("--stack")
    list_cmd.add_argument("--location")
    list_cmd.add_argument("--workshop")
    list_cmd.add_argument("--sub-workshop")
    list_cmd.add_argument("--from-date")
    list_cmd.add_argument("--to-date")
    list_cmd.add_argument("--snapshot-ids")
    list_cmd.add_argument("--search-ids")
    list_cmd.add_argument("--limit", type=int, default=100)
    list_cmd.set_defaults(func=list_data)

    groups = subparsers.add_parser("groups")
    groups.add_argument("--snapshot-ids")
    groups.add_argument("--search-ids")
    groups.add_argument("--group-type")
    groups.add_argument("--role")
    groups.add_argument("--grade")
    groups.add_argument("--stack")
    groups.add_argument("--location")
    groups.add_argument("--workshop")
    groups.add_argument("--sub-workshop")
    groups.add_argument("--from-date")
    groups.add_argument("--to-date")
    groups.add_argument("--birth-date-from")
    groups.add_argument("--birth-date-to")
    groups.set_defaults(func=list_groups)

    delete = subparsers.add_parser("delete-snapshot")
    delete.add_argument("--snapshot-id", type=int, required=True)
    delete.set_defaults(func=delete_snapshot)

    due = subparsers.add_parser("due")
    due.add_argument("--as-of")
    due.add_argument("--limit", type=int, default=10)
    due.set_defaults(func=due_searches)

    mark = subparsers.add_parser("mark-run")
    mark.add_argument("--search-id", type=int, required=True)
    mark.set_defaults(func=mark_run)

    return parser.parse_args()


def main():
    args = parse_args()
    Path(args.metrics_db).parent.mkdir(parents=True, exist_ok=True)
    args.func(args)


if __name__ == "__main__":
    main()

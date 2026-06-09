#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import sqlite3
from pathlib import Path


DEFAULT_SOURCE_DB = "hh_salary.sqlite"
DEFAULT_METRICS_DB = "salary_metrics.sqlite"


def now_utc_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def current_period():
    return dt.datetime.now().strftime("%Y-%m")


def percentile(values, q):
    if not values:
        return None
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lower = int(pos)
    upper = min(lower + 1, len(ordered) - 1)
    weight = pos - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def stats(values):
    clean = [value for value in values if value is not None]
    if not clean:
        return {
            "count": 0,
            "min": None,
            "p25": None,
            "median": None,
            "avg": None,
            "p75": None,
            "max": None,
        }
    return {
        "count": len(clean),
        "min": min(clean),
        "p25": round(percentile(clean, 0.25)),
        "median": round(percentile(clean, 0.5)),
        "avg": round(sum(clean) / len(clean)),
        "p75": round(percentile(clean, 0.75)),
        "max": max(clean),
    }


def age_bucket(age):
    if age is None:
        return "unknown"
    if age < 25:
        return "under_25"
    if age <= 34:
        return "25_34"
    if age <= 44:
        return "35_44"
    if age <= 54:
        return "45_54"
    return "55_plus"


def normalize_stack(value):
    if not value:
        return ""
    return ", ".join(part.strip() for part in value.split(",") if part.strip())


def infer_grade(title, fallback):
    if fallback:
        return fallback
    text = (title or "").lower()
    checks = [
        ("lead", ["lead", "team lead", "руководитель", "ведущий"]),
        ("senior", ["senior", "старший", "главный"]),
        ("middle", ["middle", "мидл"]),
        ("junior", ["junior", "джуниор", "младший", "стажер", "intern"]),
    ]
    for grade, markers in checks:
        if any(marker in text for marker in markers):
            return grade
    return "unknown"


def first_present(data, keys):
    for key in keys:
        value = data.get(key)
        if value:
            return value
    return None


def extract_area_name(item, fallback_area):
    area = item.get("area")
    if isinstance(area, dict):
        return area.get("name") or fallback_area
    return fallback_area


def dict_list_names(values):
    if not values:
        return ""
    result = []
    for value in values:
        if isinstance(value, dict):
            result.append(value.get("name") or value.get("id") or "")
        else:
            result.append(str(value))
    return ", ".join(item for item in result if item)


def connect_metrics_db(path):
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
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
            workshop TEXT,
            sub_workshop TEXT,
            source_db TEXT NOT NULL,
            source_query TEXT,
            notes TEXT
        )
        """
    )
    existing_snapshot_columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(metric_snapshots)")
    }
    snapshot_migrations = {
        "workshop": "ALTER TABLE metric_snapshots ADD COLUMN workshop TEXT",
        "sub_workshop": "ALTER TABLE metric_snapshots ADD COLUMN sub_workshop TEXT",
    }
    for column, sql in snapshot_migrations.items():
        if column not in existing_snapshot_columns:
            conn.execute(sql)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS salary_metric_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL REFERENCES metric_snapshots(id),
            resume_id TEXT NOT NULL,
            role TEXT NOT NULL,
            location TEXT NOT NULL,
            grade TEXT NOT NULL,
            stack TEXT NOT NULL,
            workshop TEXT,
            sub_workshop TEXT,
            salary_amount INTEGER,
            salary_currency TEXT,
            age INTEGER,
            age_bucket TEXT NOT NULL,
            resume_updated_at TEXT,
            last_hh_login_at TEXT,
            found_at TEXT NOT NULL,
            candidate_title TEXT,
            total_experience_months INTEGER,
            total_experience_years REAL,
            employment_form TEXT,
            viewed INTEGER NOT NULL DEFAULT 0,
            favorited INTEGER NOT NULL DEFAULT 0,
            marked INTEGER NOT NULL DEFAULT 0,
            source_query TEXT,
            UNIQUE(snapshot_id, resume_id)
        )
        """
    )
    existing_columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(salary_metric_observations)")
    }
    migrations = {
        "total_experience_years": "ALTER TABLE salary_metric_observations ADD COLUMN total_experience_years REAL",
        "employment_form": "ALTER TABLE salary_metric_observations ADD COLUMN employment_form TEXT",
        "viewed": "ALTER TABLE salary_metric_observations ADD COLUMN viewed INTEGER NOT NULL DEFAULT 0",
        "favorited": "ALTER TABLE salary_metric_observations ADD COLUMN favorited INTEGER NOT NULL DEFAULT 0",
        "marked": "ALTER TABLE salary_metric_observations ADD COLUMN marked INTEGER NOT NULL DEFAULT 0",
        "workshop": "ALTER TABLE salary_metric_observations ADD COLUMN workshop TEXT",
        "sub_workshop": "ALTER TABLE salary_metric_observations ADD COLUMN sub_workshop TEXT",
    }
    for column, sql in migrations.items():
        if column not in existing_columns:
            conn.execute(sql)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS salary_metric_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snapshot_id INTEGER NOT NULL REFERENCES metric_snapshots(id),
            group_type TEXT NOT NULL,
            group_value TEXT NOT NULL,
            observations_count INTEGER NOT NULL,
            salary_min INTEGER,
            salary_p25 INTEGER,
            salary_median INTEGER,
            salary_avg INTEGER,
            salary_p75 INTEGER,
            salary_max INTEGER,
            updated_at TEXT NOT NULL,
            UNIQUE(snapshot_id, group_type, group_value)
        )
        """
    )
    return conn


def fetch_source_rows(path, query):
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    sql = """
        SELECT
            resume_id,
            salary_amount,
            salary_currency,
            age,
            resume_updated_at,
            found_at,
            search_query,
            area,
            raw_item
        FROM salary_observations
        WHERE salary_amount IS NOT NULL
    """
    params = []
    if query:
        sql += " AND search_query = ?"
        params.append(query)
    sql += " ORDER BY found_at DESC"
    return [dict(row) for row in conn.execute(sql, params)]


def build_observation(row, args):
    raw = json.loads(row["raw_item"])
    title = raw.get("title")
    role = args.role or row["search_query"] or "unknown"
    location = args.location or extract_area_name(raw, row["area"]) or "unknown"
    grade = infer_grade(title, args.grade)
    stack = normalize_stack(args.stack)
    total_experience = raw.get("total_experience")
    if isinstance(total_experience, dict):
        total_experience_months = total_experience.get("months")
    else:
        total_experience_months = None
    total_experience_years = (
        round(total_experience_months / 12, 1)
        if total_experience_months is not None
        else None
    )

    return {
        "resume_id": row["resume_id"],
        "role": role,
        "location": location,
        "grade": grade,
        "stack": stack,
        "workshop": args.workshop,
        "sub_workshop": args.sub_workshop,
        "salary_amount": row["salary_amount"],
        "salary_currency": row["salary_currency"],
        "age": row["age"],
        "age_bucket": age_bucket(row["age"]),
        "resume_updated_at": row["resume_updated_at"],
        "found_at": row["found_at"],
        "candidate_title": title,
        "total_experience_months": total_experience_months,
        "total_experience_years": total_experience_years,
        "employment_form": dict_list_names(raw.get("employment_form")),
        "viewed": 1 if raw.get("viewed") else 0,
        "favorited": 1 if raw.get("favorited") else 0,
        "marked": 1 if raw.get("marked") else 0,
        "source_query": row["search_query"],
    }


def insert_snapshot(conn, args):
    cursor = conn.execute(
        """
        INSERT INTO metric_snapshots (
            created_at,
            period,
            trigger_type,
            role,
            location,
            grade,
            stack,
            workshop,
            sub_workshop,
            source_db,
            source_query,
            notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now_utc_iso(),
            args.period,
            args.trigger_type,
            args.role or args.query or "unknown",
            args.location or "from_hh_area",
            args.grade or "auto",
            normalize_stack(args.stack),
            args.workshop,
            args.sub_workshop,
            args.source_db,
            args.query,
            args.notes,
        ),
    )
    return cursor.lastrowid


def insert_observations(conn, snapshot_id, observations):
    for item in observations:
        conn.execute(
            """
            INSERT OR IGNORE INTO salary_metric_observations (
                snapshot_id,
                resume_id,
                role,
                location,
                grade,
                stack,
                workshop,
                sub_workshop,
                salary_amount,
                salary_currency,
                age,
                age_bucket,
                resume_updated_at,
                found_at,
                candidate_title,
                total_experience_months,
                total_experience_years,
                employment_form,
                viewed,
                favorited,
                marked,
                source_query
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot_id,
                item["resume_id"],
                item["role"],
                item["location"],
                item["grade"],
                item["stack"],
                item["workshop"],
                item["sub_workshop"],
                item["salary_amount"],
                item["salary_currency"],
                item["age"],
                item["age_bucket"],
                item["resume_updated_at"],
                item["found_at"],
                item["candidate_title"],
                item["total_experience_months"],
                item["total_experience_years"],
                item["employment_form"],
                item["viewed"],
                item["favorited"],
                item["marked"],
                item["source_query"],
            ),
        )


def save_group(conn, snapshot_id, group_type, group_value, values):
    result = stats(values)
    conn.execute(
        """
        INSERT OR REPLACE INTO salary_metric_groups (
            snapshot_id,
            group_type,
            group_value,
            observations_count,
            salary_min,
            salary_p25,
            salary_median,
            salary_avg,
            salary_p75,
            salary_max,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            snapshot_id,
            group_type,
            group_value,
            result["count"],
            result["min"],
            result["p25"],
            result["median"],
            result["avg"],
            result["p75"],
            result["max"],
            now_utc_iso(),
        ),
    )


def insert_groups(conn, snapshot_id, observations):
    groupers = {
        "overall": lambda item: "all",
        "location": lambda item: item["location"],
        "role": lambda item: item["role"],
        "workshop": lambda item: item["workshop"] or "unknown",
        "sub_workshop": lambda item: item["sub_workshop"] or "unknown",
        "grade": lambda item: item["grade"],
        "stack": lambda item: item["stack"] or "not_set",
        "age_bucket": lambda item: item["age_bucket"],
        "employment_form": lambda item: item["employment_form"] or "unknown",
        "viewed": lambda item: "viewed" if item["viewed"] else "not_viewed",
        "favorited": lambda item: "favorited" if item["favorited"] else "not_favorited",
        "marked": lambda item: "marked" if item["marked"] else "not_marked",
        "resume_updated_month": lambda item: (item["resume_updated_at"] or "unknown")[:7],
    }

    for group_type, key_fn in groupers.items():
        buckets = {}
        for item in observations:
            buckets.setdefault(key_fn(item), []).append(item["salary_amount"])
        for group_value, values in buckets.items():
            save_group(conn, snapshot_id, group_type, group_value, values)


def create_snapshot(args):
    rows = fetch_source_rows(args.source_db, args.query)
    observations = [build_observation(row, args) for row in rows]
    if not observations:
        raise SystemExit("No matching salary observations found.")

    conn = connect_metrics_db(args.metrics_db)
    snapshot_id = insert_snapshot(conn, args)
    insert_observations(conn, snapshot_id, observations)
    insert_groups(conn, snapshot_id, observations)
    conn.commit()

    overall = stats([item["salary_amount"] for item in observations])
    print(f"snapshot_id={snapshot_id}")
    print(f"period={args.period}")
    print(f"observations={overall['count']}")
    print(f"median={overall['median']}")
    print(f"avg={overall['avg']}")
    print(f"metrics_db={args.metrics_db}")


def list_snapshots(args):
    conn = connect_metrics_db(args.metrics_db)
    rows = conn.execute(
        """
        SELECT
            id,
            created_at,
            period,
            trigger_type,
            role,
            location,
            grade,
            stack,
            source_query
        FROM metric_snapshots
        ORDER BY id DESC
        LIMIT ?
        """,
        (args.limit,),
    ).fetchall()
    for row in rows:
        print(" | ".join("" if value is None else str(value) for value in row))


def show_groups(args):
    conn = connect_metrics_db(args.metrics_db)
    snapshot_id = args.snapshot_id
    if snapshot_id is None:
        row = conn.execute("SELECT max(id) FROM metric_snapshots").fetchone()
        snapshot_id = row[0]
    if snapshot_id is None:
        raise SystemExit("No metric snapshots found.")

    rows = conn.execute(
        """
        SELECT
            group_type,
            group_value,
            observations_count,
            salary_min,
            salary_p25,
            salary_median,
            salary_avg,
            salary_p75,
            salary_max
        FROM salary_metric_groups
        WHERE snapshot_id = ?
        ORDER BY group_type, group_value
        """,
        (snapshot_id,),
    ).fetchall()
    print(f"snapshot_id={snapshot_id}")
    for row in rows:
        print(" | ".join("" if value is None else str(value) for value in row))


def parse_args():
    parser = argparse.ArgumentParser(description="Build separate salary metric snapshots.")
    parser.add_argument("--source-db", default=DEFAULT_SOURCE_DB)
    parser.add_argument("--metrics-db", default=DEFAULT_METRICS_DB)

    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot = subparsers.add_parser("snapshot", help="Create a monthly or on-demand metric snapshot.")
    snapshot.add_argument("--period", default=current_period(), help="Metric period, for example 2026-06.")
    snapshot.add_argument("--trigger-type", default="on_demand", choices=["on_demand", "monthly"])
    snapshot.add_argument("--query", help="Only include rows from this source search query.")
    snapshot.add_argument("--role", help="Requirement role label.")
    snapshot.add_argument("--location", help="Requirement location label.")
    snapshot.add_argument("--grade", help="Requirement grade label.")
    snapshot.add_argument("--stack", help="Comma-separated technology stack label.")
    snapshot.add_argument("--workshop", help="Requirement workshop label.")
    snapshot.add_argument("--sub-workshop", help="Requirement sub-workshop label.")
    snapshot.add_argument("--notes", help="Snapshot notes.")
    snapshot.set_defaults(func=create_snapshot)

    list_cmd = subparsers.add_parser("list", help="List metric snapshots.")
    list_cmd.add_argument("--limit", type=int, default=20)
    list_cmd.set_defaults(func=list_snapshots)

    groups_cmd = subparsers.add_parser("groups", help="Show grouped metrics for a snapshot.")
    groups_cmd.add_argument("--snapshot-id", type=int)
    groups_cmd.set_defaults(func=show_groups)

    return parser.parse_args()


def main():
    args = parse_args()
    Path(args.metrics_db).parent.mkdir(parents=True, exist_ok=True)
    args.func(args)


if __name__ == "__main__":
    main()

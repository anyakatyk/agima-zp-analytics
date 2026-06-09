#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


DEFAULT_CONFIG = "llm_config.json"
DEFAULT_METRICS_DB = "salary_metrics.sqlite"


def now_utc_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def load_config(path):
    with open(path, "r", encoding="utf-8") as file:
        config = json.load(file)
    return {
        "llm_base_url": config["llm_base_url"].rstrip("/"),
        "llm_model": config["llm_model"],
        "timeout_seconds": int(config.get("timeout_seconds", 30)),
    }


def connect_db(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    existing_columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(salary_metric_observations)")
    }
    migrations = {
        "llm_role": "ALTER TABLE salary_metric_observations ADD COLUMN llm_role TEXT",
        "llm_grade": "ALTER TABLE salary_metric_observations ADD COLUMN llm_grade TEXT",
        "llm_stack": "ALTER TABLE salary_metric_observations ADD COLUMN llm_stack TEXT",
        "llm_confidence": "ALTER TABLE salary_metric_observations ADD COLUMN llm_confidence REAL",
        "llm_reason": "ALTER TABLE salary_metric_observations ADD COLUMN llm_reason TEXT",
        "llm_enriched_at": "ALTER TABLE salary_metric_observations ADD COLUMN llm_enriched_at TEXT",
        "llm_model": "ALTER TABLE salary_metric_observations ADD COLUMN llm_model TEXT",
    }
    for column, sql in migrations.items():
        if column not in existing_columns:
            conn.execute(sql)
    return conn


def latest_snapshot_id(conn):
    row = conn.execute("SELECT max(id) FROM metric_snapshots").fetchone()
    return row[0] if row else None


def fetch_rows(conn, snapshot_id, limit, include_existing):
    sql = """
        SELECT
            id,
            snapshot_id,
            resume_id,
            role,
            grade,
            stack,
            candidate_title,
            total_experience_years,
            employment_form,
            salary_amount,
            age,
            source_query,
            llm_role
        FROM salary_metric_observations
        WHERE snapshot_id = ?
    """
    params = [snapshot_id]
    if not include_existing:
        sql += " AND llm_role IS NULL"
    sql += " ORDER BY id"
    if limit:
        sql += " LIMIT ?"
        params.append(limit)
    return [dict(row) for row in conn.execute(sql, params)]


def build_prompt(row):
    payload = {
        "candidate_title": row["candidate_title"],
        "source_query": row["source_query"],
        "current_role": row["role"],
        "current_grade": row["grade"],
        "current_stack": row["stack"],
        "experience_years": row["total_experience_years"],
        "employment_form": row["employment_form"],
        "salary_amount": row["salary_amount"],
        "age": row["age"],
    }
    return (
        "Ты классифицируешь резюме для зарплатной аналитики. "
        "Верни только JSON без markdown. "
        "Поля JSON: role, grade, stack, confidence, reason. "
        "role: короткая нормализованная роль на русском. "
        "grade: one of junior, middle, senior, lead, head, unknown. "
        "stack: массив технологий/инструментов, если явно видны; иначе []. "
        "confidence: число от 0 до 1. "
        "reason: короткое объяснение до 120 символов. "
        "Не выдумывай стек, если его нет в данных.\n\n"
        f"Данные:\n{json.dumps(payload, ensure_ascii=False)}"
    )


def call_llm(config, prompt):
    request = urllib.request.Request(
        f"{config['llm_base_url']}/api/generate",
        data=json.dumps(
            {
                "model": config["llm_model"],
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": 0.1,
                },
            }
        ).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=config["timeout_seconds"]) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM HTTP {error.code}: {details}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"LLM connection error: {error.reason}") from error

    text = (data.get("response") or "").strip()
    if not text:
        raise RuntimeError("LLM returned an empty response.")
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"LLM returned invalid JSON: {text}") from error


def normalize_result(result):
    role = str(result.get("role") or "unknown").strip()
    grade = str(result.get("grade") or "unknown").strip().lower()
    if grade not in {"junior", "middle", "senior", "lead", "head", "unknown"}:
        grade = "unknown"

    stack = result.get("stack")
    if isinstance(stack, list):
        stack_text = ", ".join(str(item).strip() for item in stack if str(item).strip())
    elif stack:
        stack_text = str(stack).strip()
    else:
        stack_text = ""

    try:
        confidence = float(result.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    reason = str(result.get("reason") or "").strip()
    return role, grade, stack_text, confidence, reason


def update_row(conn, row_id, result, model):
    role, grade, stack, confidence, reason = normalize_result(result)
    conn.execute(
        """
        UPDATE salary_metric_observations
        SET
            llm_role = ?,
            llm_grade = ?,
            llm_stack = ?,
            llm_confidence = ?,
            llm_reason = ?,
            llm_enriched_at = ?,
            llm_model = ?
        WHERE id = ?
        """,
        (role, grade, stack, confidence, reason, now_utc_iso(), model, row_id),
    )
    return role, grade, stack, confidence


def parse_args():
    parser = argparse.ArgumentParser(description="Enrich salary metric rows with local LLM labels.")
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--metrics-db", default=DEFAULT_METRICS_DB)
    parser.add_argument("--snapshot-id", type=int)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--include-existing", action="store_true")
    parser.add_argument("--delay", type=float, default=0.2)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    if not Path(args.config).exists():
        print(f"Missing config: {args.config}", file=sys.stderr)
        return 1

    config = load_config(args.config)
    conn = connect_db(args.metrics_db)
    snapshot_id = args.snapshot_id or latest_snapshot_id(conn)
    if snapshot_id is None:
        print("No metric snapshots found.", file=sys.stderr)
        return 1

    rows = fetch_rows(conn, snapshot_id, args.limit, args.include_existing)
    print(f"snapshot_id={snapshot_id}")
    print(f"rows_to_enrich={len(rows)}")
    if not rows:
        return 0

    for index, row in enumerate(rows, start=1):
        prompt = build_prompt(row)
        result = call_llm(config, prompt)
        role, grade, stack, confidence = normalize_result(result)
        if args.dry_run:
            print(f"{index}/{len(rows)} resume={row['resume_id']} role={role} grade={grade} stack={stack} confidence={confidence}")
        else:
            update_row(conn, row["id"], result, config["llm_model"])
            conn.commit()
            print(f"{index}/{len(rows)} saved resume={row['resume_id']} role={role} grade={grade} confidence={confidence}")
        if args.delay and index < len(rows):
            time.sleep(args.delay)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())


"""Supabase에 get_attendance_leaderboard(패·무) 마이그레이션을 적용합니다.

SUPABASE_DB_URL 또는 DATABASE_URL 환경 변수가 필요합니다.
예: postgresql://postgres.[ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
"""

from __future__ import annotations

import os
import subprocess
import sys

from fetch_kbo_2026 import _load_local_env, require_env

MIGRATION = os.path.join(
  os.path.dirname(__file__),
  "..",
  "supabase",
  "migrations",
  "20260518_leaderboard_losses_draws.sql",
)


def apply_with_psycopg(db_url: str, sql: str) -> None:
  try:
    import psycopg2
  except ImportError as exc:
    raise RuntimeError("psycopg2-binary가 필요합니다: pip install psycopg2-binary") from exc

  conn = psycopg2.connect(db_url)
  conn.autocommit = True
  try:
    with conn.cursor() as cur:
      cur.execute(sql)
  finally:
    conn.close()


def apply_with_supabase_cli(db_url: str, migration_path: str) -> None:
  result = subprocess.run(
    ["npx", "--yes", "supabase", "db", "query", "--db-url", db_url, "--file", migration_path],
    check=False,
    capture_output=True,
    text=True,
  )
  if result.returncode != 0:
    raise RuntimeError(result.stderr or result.stdout or "supabase db query failed")


def main() -> None:
  _load_local_env()
  db_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
  if not db_url:
    ref = require_env("SUPABASE_URL").replace("https://", "").split(".")[0]
    password = os.getenv("SUPABASE_DB_PASSWORD")
    host = os.getenv("SUPABASE_DB_HOST", "aws-0-ap-northeast-2.pooler.supabase.com")
    if password:
      db_url = f"postgresql://postgres.{ref}:{password}@{host}:6543/postgres"

  if not db_url:
    print(
      "SUPABASE_DB_URL, DATABASE_URL, 또는 SUPABASE_DB_PASSWORD 환경 변수가 필요합니다.\n"
      "Supabase Dashboard > Project Settings > Database 에서 연결 문자열을 확인하세요.",
      file=sys.stderr,
    )
    sys.exit(1)

  migration_path = os.path.abspath(MIGRATION)
  with open(migration_path, encoding="utf-8") as handle:
    sql = handle.read()

  try:
    apply_with_psycopg(db_url, sql)
    print("Migration applied via psycopg2.")
  except Exception:
    apply_with_supabase_cli(db_url, migration_path)
    print("Migration applied via supabase CLI.")

  print("Done: get_attendance_leaderboard now includes losses and draws.")


if __name__ == "__main__":
  main()

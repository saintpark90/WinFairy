"""
GitHub Actions 등에서 KBO 동기화 후 DB 스코어가 반영됐는지 검증합니다.
KBO 일정에 종료된 오늘 한화 경기가 있는데 DB 스코어가 비어 있으면 실패(exit 1).
"""

from __future__ import annotations

import datetime as dt
import os
import sys

import requests

from fetch_kbo_2026 import (
  _load_local_env,
  fetch_schedule_from_schedule_page,
  normalize_match_core_only,
  require_env,
)


def main() -> None:
  _load_local_env()
  supabase_url = require_env("SUPABASE_URL")
  service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
  season = int(os.getenv("TARGET_SEASON", str(dt.date.today().year)))
  today = dt.date.today().isoformat()

  project_ref = supabase_url.rstrip("/").split("//", 1)[-1].split(".", 1)[0]
  print(f"Supabase project ref: {project_ref}")

  kbo_today = None
  for row in fetch_schedule_from_schedule_page(season):
    normalized = normalize_match_core_only(row, season)
    if normalized and normalized["game_date"] == today:
      kbo_today = normalized
      break

  headers = {
    "apikey": service_role_key,
    "Authorization": f"Bearer {service_role_key}",
  }
  resp = requests.get(
    f"{supabase_url.rstrip('/')}/rest/v1/matches",
    headers=headers,
    params={
      "select": "game_date,hanwha_score,opponent_score,winner_team",
      "game_date": f"eq.{today}",
    },
    timeout=30,
  )
  resp.raise_for_status()
  db_rows = resp.json()

  if kbo_today is None:
    print(f"OK: no Hanwha game on KBO schedule for {today}")
    return

  if kbo_today.get("hanwha_score") is None or kbo_today.get("opponent_score") is None:
    print(f"OK: today's game not finished on KBO yet ({today})")
    return

  if not db_rows:
    print(f"FAIL: no matches row for {today} in DB (KBO has finished score)")
    sys.exit(1)

  db_row = db_rows[0]
  if db_row.get("hanwha_score") is None or db_row.get("opponent_score") is None:
    print(
      f"FAIL: DB missing scores for {today} "
      f"(KBO {kbo_today['hanwha_score']}:{kbo_today['opponent_score']}, "
      f"DB {db_row.get('hanwha_score')}:{db_row.get('opponent_score')})",
    )
    sys.exit(1)

  print(
    f"OK: {today} scores in DB "
    f"{db_row['hanwha_score']}:{db_row['opponent_score']} "
    f"(KBO {kbo_today['hanwha_score']}:{kbo_today['opponent_score']})",
  )


if __name__ == "__main__":
  main()

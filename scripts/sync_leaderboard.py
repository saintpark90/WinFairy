"""직관 순위(승·패·무)를 Supabase Storage JSON으로 동기화합니다.

운영 DB에 get_attendance_leaderboard RPC 마이그레이션이 아직 없을 때
순위 페이지가 패·무를 표시할 수 있도록 public JSON을 갱신합니다.
fetch_kbo_2026.py 마지막에도 호출됩니다.
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from typing import Any

import requests

from fetch_kbo_2026 import _load_local_env, require_env

HANWHA = "한화"
BUCKET = "public-data"
OBJECT_PATH = "leaderboard.json"
CANCELLED_RE = re.compile(r"취소|노게임|무효|제외")


def is_match_cancelled(match: dict[str, Any] | None) -> bool:
  if not match or not match.get("game_status"):
    return False
  return bool(CANCELLED_RE.search(str(match["game_status"])))


def is_match_decided(match: dict[str, Any] | None) -> bool:
  if not match:
    return False
  if is_match_cancelled(match):
    return False
  winner = match.get("winner_team")
  if winner is not None and str(winner).strip():
    return True
  hanwha_score = match.get("hanwha_score")
  opponent_score = match.get("opponent_score")
  return isinstance(hanwha_score, (int, float)) and isinstance(opponent_score, (int, float))


def is_draw(match: dict[str, Any] | None) -> bool:
  if not is_match_decided(match):
    return False
  hanwha_score = match.get("hanwha_score")
  opponent_score = match.get("opponent_score")
  if isinstance(hanwha_score, (int, float)) and isinstance(opponent_score, (int, float)):
    return hanwha_score == opponent_score
  winner = match.get("winner_team") or ""
  return "무" in str(winner)


def is_hanwha_win(match: dict[str, Any] | None) -> bool:
  if not is_match_decided(match):
    return False
  if is_draw(match):
    return False
  winner = match.get("winner_team")
  if not winner:
    return False
  return HANWHA in str(winner)


def is_hanwha_loss(match: dict[str, Any] | None) -> bool:
  return is_match_decided(match) and not is_hanwha_win(match) and not is_draw(match)


def _headers(service_role_key: str) -> dict[str, str]:
  return {
    "apikey": service_role_key,
    "Authorization": f"Bearer {service_role_key}",
    "Content-Type": "application/json",
  }


def _fetch_all(
  base_url: str,
  service_role_key: str,
  table: str,
  select: str,
) -> list[dict[str, Any]]:
  rows: list[dict[str, Any]] = []
  offset = 0
  page_size = 1000
  headers = _headers(service_role_key)

  while True:
    url = (
      f"{base_url}/rest/v1/{table}"
      f"?select={requests.utils.quote(select, safe='(),*')}"
      f"&offset={offset}&limit={page_size}"
    )
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code >= 400:
      raise RuntimeError(f"Supabase fetch failed ({table}): {resp.status_code} {resp.text[:300]}")
    batch = resp.json()
    if not batch:
      break
    rows.extend(batch)
    if len(batch) < page_size:
      break
    offset += page_size

  return rows


def build_leaderboard_rows(
  profiles: list[dict[str, Any]],
  attendance: list[dict[str, Any]],
) -> list[dict[str, Any]]:
  profile_by_id = {row["id"]: row for row in profiles}
  stats_by_user: dict[str, dict[str, int]] = defaultdict(
    lambda: {"games": 0, "wins": 0, "losses": 0, "draws": 0, "win_rate_denominator": 0},
  )

  for row in attendance:
    user_id = row["user_id"]
    match = row.get("matches")
    bucket = stats_by_user[user_id]
    bucket["games"] += 1

    if match and match.get("winner_team") and str(match["winner_team"]).strip():
      bucket["win_rate_denominator"] += 1

    if is_hanwha_win(match):
      bucket["wins"] += 1
    elif is_hanwha_loss(match):
      bucket["losses"] += 1
    elif is_draw(match):
      bucket["draws"] += 1

  rows: list[dict[str, Any]] = []
  for user_id, stats in stats_by_user.items():
    if stats["games"] <= 0:
      continue
    profile = profile_by_id.get(user_id, {})
    display_name = (profile.get("display_name") or "").strip() or "회원"
    denominator = stats["win_rate_denominator"]
    win_rate = round(100.0 * stats["wins"] / denominator, 1) if denominator > 0 else 0.0
    rows.append(
      {
        "user_id": user_id,
        "display_name": display_name,
        "avatar_url": profile.get("avatar_url"),
        "games": stats["games"],
        "wins": stats["wins"],
        "losses": stats["losses"],
        "draws": stats["draws"],
        "win_rate": win_rate,
      },
    )

  rows.sort(key=lambda row: (-row["wins"], -row["games"], row["display_name"]))
  return rows


def ensure_public_bucket(base_url: str, service_role_key: str) -> None:
  headers = _headers(service_role_key)
  resp = requests.get(f"{base_url}/storage/v1/bucket", headers=headers, timeout=30)
  if resp.status_code >= 400:
    raise RuntimeError(f"Storage bucket list failed: {resp.status_code} {resp.text[:300]}")

  if any(item.get("name") == BUCKET or item.get("id") == BUCKET for item in resp.json()):
    return

  create = requests.post(
    f"{base_url}/storage/v1/bucket",
    headers=headers,
    json={"id": BUCKET, "name": BUCKET, "public": True},
    timeout=30,
  )
  if create.status_code >= 400 and create.status_code != 409:
    raise RuntimeError(f"Storage bucket create failed: {create.status_code} {create.text[:300]}")


def upload_leaderboard(base_url: str, service_role_key: str, rows: list[dict[str, Any]]) -> None:
  ensure_public_bucket(base_url, service_role_key)
  payload = json.dumps(rows, ensure_ascii=False).encode("utf-8")
  headers = {
    "apikey": service_role_key,
    "Authorization": f"Bearer {service_role_key}",
    "Content-Type": "application/json",
    "x-upsert": "true",
  }
  url = f"{base_url}/storage/v1/object/{BUCKET}/{OBJECT_PATH}"
  resp = requests.post(url, headers=headers, data=payload, timeout=60)
  if resp.status_code >= 400:
    raise RuntimeError(f"Leaderboard upload failed: {resp.status_code} {resp.text[:300]}")


def sync_leaderboard() -> list[dict[str, Any]]:
  _load_local_env()
  base_url = require_env("SUPABASE_URL").rstrip("/")
  service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

  profiles = _fetch_all(base_url, service_role_key, "profiles", "id,display_name,avatar_url")
  attendance = _fetch_all(
    base_url,
    service_role_key,
    "user_attendance",
    "user_id,match_id,attended_at,matches(*)",
  )
  rows = build_leaderboard_rows(profiles, attendance)
  upload_leaderboard(base_url, service_role_key, rows)
  return rows


def main() -> None:
  rows = sync_leaderboard()
  print(f"Leaderboard synced: {len(rows)} members -> {BUCKET}/{OBJECT_PATH}")
  if rows:
    sample = rows[0]
    print(
      "sample:",
      sample["display_name"],
      f"games={sample['games']}",
      f"w={sample['wins']}",
      f"l={sample['losses']}",
      f"d={sample['draws']}",
    )


if __name__ == "__main__":
  main()

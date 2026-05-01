import datetime as dt
import json
import os
import time
from typing import Any, Dict, List

import requests

HANWHA_KEYWORDS = ("한화", "Eagles", "Hanwha")
TEAM_ID_TO_NAME = {
  "HH": "한화",
  "OB": "두산",
  "LG": "LG",
  "LT": "롯데",
  "HT": "KIA",
  "SS": "삼성",
  "WO": "키움",
  "SK": "SSG",
  "KT": "KT",
  "NC": "NC",
}


def require_env(name: str) -> str:
  value = os.getenv(name)
  if not value:
    raise RuntimeError(f"Missing required environment variable: {name}")
  return value


def fetch_schedule(year: int) -> List[Dict[str, Any]]:
  endpoint = os.getenv(
    "KBO_SCHEDULE_ENDPOINT",
    "https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList",
  )
  start_date_text = os.getenv("KBO_START_DATE", f"{year}-03-01")
  start_date = dt.date.fromisoformat(start_date_text)
  end_date = min(dt.date.today(), dt.date(year, 12, 31))
  if start_date > end_date:
    return []

  rows: List[Dict[str, Any]] = []
  current = start_date
  while current <= end_date:
    params = {
      "leId": 1,
      "srId": 0,
      "date": current.strftime("%Y%m%d"),
    }
    resp = requests.get(endpoint, params=params, timeout=30)
    resp.raise_for_status()
    try:
      payload = resp.json()
    except json.JSONDecodeError as exc:
      raise RuntimeError("Schedule API did not return JSON. Check endpoint.") from exc
    games = payload.get("game") or payload.get("data") or []
    if isinstance(games, list):
      rows.extend(games)
    current += dt.timedelta(days=1)
    time.sleep(0.05)

  return rows


def parse_int(value: Any) -> int | None:
  if isinstance(value, int):
    return value
  if isinstance(value, str) and value.strip().isdigit():
    return int(value.strip())
  return None


def normalize_match(row: Dict[str, Any], season: int) -> Dict[str, Any] | None:
  home_id = (row.get("HOME_ID") or "").strip()
  away_id = (row.get("AWAY_ID") or "").strip()
  home_name = TEAM_ID_TO_NAME.get(home_id, (row.get("HOME_NM") or "").strip())
  away_name = TEAM_ID_TO_NAME.get(away_id, (row.get("AWAY_NM") or "").strip())
  if not any(k in home_name for k in HANWHA_KEYWORDS) and not any(
    k in away_name for k in HANWHA_KEYWORDS
  ):
    return None

  raw_date = row.get("G_DT") or row.get("gameDate")
  if not raw_date:
    return None

  if len(raw_date) == 8 and raw_date.isdigit():
    game_date = dt.datetime.strptime(raw_date, "%Y%m%d").date().isoformat()
  else:
    game_date = raw_date[:10]

  is_home = any(k in home_name for k in HANWHA_KEYWORDS)
  hanwha_score = parse_int(row.get("B_SCORE_CN") if is_home else row.get("T_SCORE_CN"))
  opp_score = parse_int(row.get("T_SCORE_CN") if is_home else row.get("B_SCORE_CN"))

  winner = None
  if hanwha_score is not None and opp_score is not None:
    if hanwha_score > opp_score:
      winner = "한화 이글스"
    elif opp_score > hanwha_score:
      winner = away_name if is_home else home_name

  return {
    "game_date": game_date,
    "season": season,
    "opponent_team": away_name if is_home else home_name,
    "stadium": row.get("S_NM") or row.get("stadium") or "미정",
    "home_away": "HOME" if is_home else "AWAY",
    "hanwha_score": hanwha_score,
    "opponent_score": opp_score,
    "winner_team": winner,
    "game_status": row.get("GAME_SC_NM") or row.get("GAME_STATE") or row.get("gameStatus"),
    "source": "KBO",
    "player_stats": [],
  }


def upsert_matches(supabase_url: str, service_role_key: str, rows: List[Dict[str, Any]]) -> None:
  endpoint = f"{supabase_url}/rest/v1/matches?on_conflict=game_date"
  headers = {
    "apikey": service_role_key,
    "Authorization": f"Bearer {service_role_key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
  }
  resp = requests.post(endpoint, headers=headers, data=json.dumps(rows), timeout=30)
  resp.raise_for_status()


def main() -> None:
  season = int(os.getenv("TARGET_SEASON", str(dt.date.today().year)))
  supabase_url = require_env("SUPABASE_URL")
  service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

  raw_rows = fetch_schedule(season)
  normalized = []
  for row in raw_rows:
    normalized_row = normalize_match(row, season)
    if normalized_row:
      normalized.append(normalized_row)

  if not normalized:
    raise RuntimeError("No Hanwha games were parsed. Check endpoint or parser fields.")

  upsert_matches(supabase_url, service_role_key, normalized)
  print(f"Upsert complete: {len(normalized)} matches")


if __name__ == "__main__":
  main()

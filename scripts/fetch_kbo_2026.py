"""
한화 경기 일정·결과를 KBO 공식 [경기일정/결과](https://www.koreabaseball.com/Schedule/Schedule.aspx)
와 동일한 소스(`/ws/Schedule.asmx/GetScheduleList`, 한화 필터)에서 가져와 Supabase `matches`에 반영합니다.
"""

import datetime as dt
import html
import json
import os
import re
import time
from typing import Any, Dict, List, Tuple

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

# Schedule.aspx 리스트 셀: `<span>원정</span><em>…점수…</em><span>홈</span>`
PLAY_DECIDED_RE = re.compile(
  r'<span>([^<]+)</span><em><span class="(?:lose|win)">(\d+)</span><span>vs</span>'
  r'<span class="(?:lose|win)">(\d+)</span></em><span>([^<]+)</span>',
)
PLAY_PENDING_RE = re.compile(r'<span>([^<]+)</span><em><span>vs</span></em><span>([^<]+)</span>')
GAME_LINK_RE = re.compile(r"gameDate=(\d{8})&gameId=([^&'\"]+)")
GAME_ID_TEAMS_RE = re.compile(r"^(\d{8})([A-Za-z]{2})([A-Za-z]{2})(\d)$")
TIME_CELL_RE = re.compile(r"<b>([^<]+)</b>")
TAG_STRIP_RE = re.compile(r"<[^>]+>")
DAY_CELL_DATE_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\(")
HR_TOKEN_RE = re.compile(r"(\d+)?[홈Ȩ]")
DOUBLE_TOKEN_RE = re.compile(r"(\d+)?2��")
TRIPLE_TOKEN_RE = re.compile(r"(\d+)?3��")
PERCENT_PREFIX_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)%")


def require_env(name: str) -> str:
  value = os.getenv(name)
  if not value:
    raise RuntimeError(f"Missing required environment variable: {name}")
  return value


def _day_cell_to_yyyymmdd(day_text: str, year: int) -> str | None:
  m = DAY_CELL_DATE_RE.search(day_text or "")
  if not m:
    return None
  month, day = int(m.group(1)), int(m.group(2))
  try:
    return dt.date(year, month, day).strftime("%Y%m%d")
  except ValueError:
    return None


def _display_to_team_code(label: str) -> str | None:
  s = (label or "").strip()
  if not s:
    return None
  if s in TEAM_ID_TO_NAME:
    return s
  for code, disp in TEAM_ID_TO_NAME.items():
    if disp == s:
      return code
  return None


def _strip_tags(html: str) -> str:
  return TAG_STRIP_RE.sub("", html or "").strip()


def _clean_cell_text(value: Any) -> str:
  text = _strip_tags(str(value or ""))
  text = text.replace("&nbsp;", "").strip()
  return html.unescape(text)


def _extract_game_link(cells: List[Dict[str, Any]]) -> Tuple[str, str] | None:
  for cell in cells:
    text = cell.get("Text") or ""
    m = GAME_LINK_RE.search(text)
    if m:
      return m.group(1), m.group(2)
  return None


def _parse_game_id_teams(game_id: str) -> Tuple[str, str] | None:
  m = GAME_ID_TEAMS_RE.match(game_id.strip())
  if not m:
    return None
  return m.group(2).upper(), m.group(3).upper()


def _schedule_list_row_to_game_row(
  cells: List[Dict[str, Any]], year: int
) -> Tuple[Dict[str, Any], str] | None:
  """Schedule.aspx → GetScheduleList 한 행을 GetKboGameList 형태로 변환."""
  if len(cells) < 8:
    return None

  time_html = cells[1].get("Text") or ""
  tm = TIME_CELL_RE.search(time_html)
  g_tm = tm.group(1).strip() if tm else None

  play_html = cells[2].get("Text") or ""
  dm = PLAY_DECIDED_RE.search(play_html)
  pm = PLAY_PENDING_RE.search(play_html)
  if not dm and not pm:
    return None

  away_score: int | None = None
  home_score: int | None = None
  if dm:
    away_score = int(dm.group(2))
    home_score = int(dm.group(3))

  stadium_raw = cells[7].get("Text") or ""
  stadium = _strip_tags(stadium_raw) or "미정"

  note = _strip_tags(cells[8].get("Text") or "")
  game_sc = note if note and note != "-" else None

  link = _extract_game_link(cells)
  g_dt: str
  game_id: str
  away_id: str
  home_id: str

  if link:
    g_dt, game_id = link
    teams = _parse_game_id_teams(game_id)
    if not teams:
      return None
    away_id, home_id = teams
  else:
    g_dt8 = _day_cell_to_yyyymmdd(cells[0].get("Text") or "", year)
    if not g_dt8:
      return None
    if dm:
      away_code = _display_to_team_code(dm.group(1))
      home_code = _display_to_team_code(dm.group(4))
    else:
      away_code = _display_to_team_code(pm.group(1))
      home_code = _display_to_team_code(pm.group(2))
    if not away_code or not home_code:
      return None
    away_id, home_id = away_code, home_code
    g_dt = g_dt8
    game_id = f"{g_dt}{away_id}{home_id}0"

  away_nm = TEAM_ID_TO_NAME.get(away_id, away_id)
  home_nm = TEAM_ID_TO_NAME.get(home_id, home_id)

  return (
    {
      "G_DT": g_dt,
      "G_ID": game_id,
      "HOME_ID": home_id,
      "AWAY_ID": away_id,
      "HOME_NM": home_nm,
      "AWAY_NM": away_nm,
      "T_SCORE_CN": str(away_score) if away_score is not None else None,
      "B_SCORE_CN": str(home_score) if home_score is not None else None,
      "G_TM": g_tm,
      "S_NM": stadium,
      "GAME_SC_NM": game_sc,
    },
    game_id,
  )


def fetch_schedule_from_schedule_page(year: int) -> List[Dict[str, Any]]:
  """
  https://www.koreabaseball.com/Schedule/Schedule.aspx 와 동일한 월별 리스트 API.
  정규시즌(srIdList)만 조회하며, 한화 경기만(teamId=HH) 내려받습니다.
  """
  base = os.getenv(
    "KBO_SCHEDULE_LIST_URL",
    "https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList",
  )
  sr_list = os.getenv("KBO_SR_ID_LIST", "0,9,6")
  month_start = int(os.getenv("KBO_SCHEDULE_MONTH_START", "3"))
  month_end = int(os.getenv("KBO_SCHEDULE_MONTH_END", "11"))

  headers = {
    "User-Agent": "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.koreabaseball.com/Schedule/Schedule.aspx",
    "Origin": "https://www.koreabaseball.com",
  }

  out: List[Dict[str, Any]] = []
  seen_game_id: set[str] = set()

  for month in range(month_start, month_end + 1):
    data = {
      "leId": 1,
      "srIdList": sr_list,
      "seasonId": str(year),
      "gameMonth": str(month),
      "teamId": "HH",
    }
    resp = requests.post(base, data=data, headers=headers, timeout=60)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    try:
      payload = resp.json()
    except json.JSONDecodeError as exc:
      raise RuntimeError("GetScheduleList did not return JSON.") from exc

    for block in payload.get("rows") or []:
      cells = block.get("row")
      if not isinstance(cells, list):
        continue
      parsed = _schedule_list_row_to_game_row(cells, year)
      if not parsed:
        continue
      row, game_id = parsed
      if game_id in seen_game_id:
        continue
      seen_game_id.add(game_id)
      out.append(row)

    time.sleep(0.08)

  return out


def parse_int(value: Any) -> int | None:
  if isinstance(value, int):
    return value
  if isinstance(value, str) and value.strip().isdigit():
    return int(value.strip())
  return None


def parse_float(value: Any) -> float | None:
  if isinstance(value, (int, float)):
    return float(value)
  if isinstance(value, str):
    s = value.strip()
    if not s:
      return None
    try:
      return float(s)
    except ValueError:
      return None
  return None


def _extract_boxscore_team_tables(
  game_id: str, season: int, sr_id: str = "0"
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]] | None:
  endpoint = "https://www.koreabaseball.com/ws/Schedule.asmx/GetBoxScoreScroll"
  params = {
    "leId": "1",
    "srId": sr_id,
    "seasonId": str(season),
    "gameId": game_id,
  }
  headers = {
    "User-Agent": "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx?gameId={game_id}&section=REVIEW",
  }
  try:
    resp = requests.post(endpoint, data=params, headers=headers, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
  except Exception:
    return None

  hitters = payload.get("arrHitter") or []
  pitchers = payload.get("arrPitcher") or []
  if not isinstance(hitters, list) or not isinstance(pitchers, list):
    return None
  return hitters, pitchers


def _extract_hanwha_hitter_stats(
  team_table: dict[str, Any], team_name: str
) -> list[dict[str, Any]]:
  try:
    t1 = json.loads(team_table["table1"])  # 타순/선수명
    t2 = json.loads(team_table["table2"])  # 이벤트(2루타/홈런 등)
    t3 = json.loads(team_table["table3"])  # 경기기록(타수/안타/.../타율)
  except Exception:
    return []

  r1 = t1.get("rows") or []
  r2 = t2.get("rows") or []
  r3 = t3.get("rows") or []
  count = min(len(r1), len(r3))
  out: list[dict[str, Any]] = []
  for i in range(count):
    row1 = r1[i].get("row") or []
    row3 = r3[i].get("row") or []
    if len(row1) < 3 or len(row3) < 5:
      continue
    player_name = _clean_cell_text(row1[2].get("Text"))
    if not player_name:
      continue

    # table3: [타수, 안타, 타점, 볼넷, 타율] 구조
    at_bats = parse_int(_clean_cell_text(row3[0].get("Text")))
    hits = parse_int(_clean_cell_text(row3[1].get("Text")))
    rbi = parse_int(_clean_cell_text(row3[2].get("Text")))
    walks = parse_int(_clean_cell_text(row3[3].get("Text")))
    batting_avg = parse_float(_clean_cell_text(row3[4].get("Text")))

    home_runs = 0
    doubles = 0
    triples = 0
    if i < len(r2):
      ev_cells = r2[i].get("row") or []
      ev_text = " ".join(_clean_cell_text(c.get("Text")) for c in ev_cells)
      for m in HR_TOKEN_RE.finditer(ev_text):
        home_runs += int(m.group(1)) if m.group(1) else 1
      for m in DOUBLE_TOKEN_RE.finditer(ev_text):
        doubles += int(m.group(1)) if m.group(1) else 1
      for m in TRIPLE_TOKEN_RE.finditer(ev_text):
        triples += int(m.group(1)) if m.group(1) else 1

    plate_appearances = None
    if at_bats is not None and walks is not None:
      plate_appearances = at_bats + walks

    out.append(
      {
        "player_name": player_name,
        "team_name": team_name,
        "position_type": "batter",
        "war": None,
        "batting_avg": batting_avg,
        "plate_appearances": plate_appearances,
        "at_bats": at_bats if at_bats is not None else 0,
        "hits": hits if hits is not None else 0,
        "doubles": doubles,
        "triples": triples,
        "home_runs": home_runs,
        "rbi": rbi if rbi is not None else 0,
        "walks": walks if walks is not None else 0,
        "ops": None,
      }
    )
  return out


def _parse_innings_to_outs(value: str) -> int | None:
  s = (value or "").strip()
  if not s:
    return None
  if " " in s:
    whole, frac = s.split(" ", 1)
  else:
    whole, frac = s, ""
  whole_n = parse_int(whole)
  if whole_n is None:
    return None
  outs = whole_n * 3
  frac = frac.strip()
  if frac == "1/3":
    outs += 1
  elif frac == "2/3":
    outs += 2
  return outs


def _extract_hanwha_pitcher_stats(
  team_table: dict[str, Any], team_name: str
) -> list[dict[str, Any]]:
  try:
    table = json.loads(team_table["table"])
  except Exception:
    return []

  rows = table.get("rows") or []
  out: list[dict[str, Any]] = []
  for r in rows:
    cells = r.get("row") or []
    if len(cells) < 17:
      continue
    vals = [_clean_cell_text(c.get("Text")) for c in cells]
    player_name = vals[0]
    if not player_name:
      continue
    result_text = vals[2]
    # 박스스코어 투수표의 승/패/세 컬럼은 시즌 누적값이므로 합산하면 과대집계됩니다.
    # 직관 기준 집계에서는 경기 결과 텍스트(승/홀드/세이브)로 경기별 0/1 카운트를 저장합니다.
    wins = 1 if ("승" in result_text) else 0
    holds = 1 if ("홀드" in result_text or "Ȧ" in result_text) else 0
    saves = 1 if ("세" in result_text) else 0
    innings_outs = _parse_innings_to_outs(vals[6])
    at_bats_faced = parse_int(vals[9])
    hits_allowed = parse_int(vals[10])
    home_runs_allowed = parse_int(vals[11])
    walks_allowed = parse_int(vals[12])
    strikeouts = parse_int(vals[13])
    runs_allowed = parse_int(vals[14])
    earned_runs = parse_int(vals[15])
    era = parse_float(vals[16])

    whip = None
    if innings_outs and innings_outs > 0:
      h = hits_allowed or 0
      bb = walks_allowed or 0
      whip = round((h + bb) / (innings_outs / 3), 2)

    out.append(
      {
        "player_name": player_name,
        "team_name": team_name,
        "position_type": "pitcher",
        "war": None,
        "era": era,
        "innings_pitched_outs": innings_outs,
        "at_bats_faced": at_bats_faced if at_bats_faced is not None else 0,
        "hits_allowed": hits_allowed if hits_allowed is not None else 0,
        "home_runs_allowed": home_runs_allowed if home_runs_allowed is not None else 0,
        "walks_allowed": walks_allowed if walks_allowed is not None else 0,
        "strikeouts": strikeouts if strikeouts is not None else 0,
        "runs_allowed": runs_allowed if runs_allowed is not None else 0,
        "earned_runs": earned_runs if earned_runs is not None else 0,
        "whip": whip,
        "wins": wins,
        "holds": holds,
        "saves": saves,
      }
    )
  return out


def _fetch_key_player_metric_map(
  game_id: str, sr_id: str, endpoint_name: str, group_sc: str
) -> dict[str, float]:
  endpoint = f"https://www.koreabaseball.com/ws/Schedule.asmx/{endpoint_name}"
  params = {
    "leId": "1",
    "srId": sr_id or "0",
    "gameId": game_id,
    "groupSc": group_sc,
    "sort": "DESC",
  }
  headers = {
    "User-Agent": "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx?gameId={game_id}&section=REVIEW",
  }
  try:
    resp = requests.post(endpoint, data=params, headers=headers, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
  except Exception:
    return {}

  if payload.get("code") != "100":
    return {}

  out: dict[str, float] = {}
  for rec in payload.get("record") or []:
    name = _clean_cell_text(rec.get("P_NM"))
    if not name:
      continue
    raw = _clean_cell_text(rec.get("RECORD_IF"))
    val = parse_float(raw)
    if val is None:
      m = PERCENT_PREFIX_RE.search(raw)
      if m:
        val = parse_float(m.group(1))
    if val is None:
      continue
    out[name] = val
  return out


def _enrich_with_key_player_metrics(
  players: list[dict[str, Any]], game_id: str, sr_id: str
) -> list[dict[str, Any]]:
  hitter_ops = _fetch_key_player_metric_map(game_id, sr_id, "GetKeyPlayerHitter", "OPS_RT")
  hitter_wpa = _fetch_key_player_metric_map(game_id, sr_id, "GetKeyPlayerHitter", "GAME_WPA_RT")
  pitcher_wpa = _fetch_key_player_metric_map(game_id, sr_id, "GetKeyPlayerPitcher", "GAME_WPA_RT")

  if not hitter_ops and not hitter_wpa and not pitcher_wpa:
    return players

  for player in players:
    name = player.get("player_name")
    if not name:
      continue
    if player.get("position_type") == "batter":
      if name in hitter_ops:
        player["ops"] = hitter_ops[name]
      # KBO 공개 API에서 경기 단위 WAR를 제공하지 않아, 키플레이어 WPA를 대체 지표로 사용.
      if name in hitter_wpa:
        player["war"] = hitter_wpa[name]
    elif player.get("position_type") == "pitcher":
      if name in pitcher_wpa:
        player["war"] = pitcher_wpa[name]
  return players


def build_player_stats_from_kbo_row(
  row: Dict[str, Any],
  is_home: bool,
  han_won: bool | None,
  season: int,
) -> List[Dict[str, Any]]:
  """
  게임센터 박스스코어(GetBoxScoreScroll)에서 한화 선수 스탯을 추출합니다.
  실패 시 최소 요약 스냅샷(선발/승패/세이브 투수명, 대표 타자명)으로 폴백합니다.
  """
  game_id = (row.get("G_ID") or "").strip()
  sr_id = str(row.get("SR_ID") or "0")
  if game_id:
    team_tables = _extract_boxscore_team_tables(game_id, season)
    if team_tables:
      hitters, pitchers = team_tables
      han_idx = 1 if is_home else 0
      if han_idx < len(hitters) and han_idx < len(pitchers):
        parsed = _extract_hanwha_hitter_stats(hitters[han_idx], "한화 이글스")
        parsed.extend(_extract_hanwha_pitcher_stats(pitchers[han_idx], "한화 이글스"))
        if parsed:
          return _enrich_with_key_player_metrics(parsed, game_id, sr_id)

  stats: List[Dict[str, Any]] = []
  prefix = "B" if is_home else "T"

  def append_player(position_type: str, name: str) -> None:
    name = (name or "").strip()
    if not name:
      return
    stats.append(
      {
        "player_name": name,
        "team_name": "한화 이글스",
        "position_type": position_type,
      }
    )

  append_player("pitcher", row.get(f"{prefix}_PIT_P_NM"))
  append_player("batter", row.get(f"{prefix}_P_NM"))

  if han_won is True:
    append_player("pitcher", row.get("W_PIT_P_NM"))
    append_player("pitcher", row.get("SV_PIT_P_NM"))
  elif han_won is False:
    append_player("pitcher", row.get("L_PIT_P_NM"))

  deduped: List[Dict[str, Any]] = []
  seen: set[tuple[str, str]] = set()
  for player in stats:
    key = (player["player_name"], player["position_type"])
    if key in seen:
      continue
    seen.add(key)
    deduped.append(player)
  return deduped


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
  han_won: bool | None = None
  if hanwha_score is not None and opp_score is not None:
    if hanwha_score > opp_score:
      winner = "한화 이글스"
      han_won = True
    elif opp_score > hanwha_score:
      winner = away_name if is_home else home_name
      han_won = False

  player_stats = build_player_stats_from_kbo_row(row, is_home, han_won, season)

  g_tm = row.get("G_TM") or row.get("gameTime")
  game_start_time = None
  if isinstance(g_tm, str) and g_tm.strip():
    game_start_time = g_tm.strip()

  payload = {
    "game_date": game_date,
    "season": season,
    "opponent_team": away_name if is_home else home_name,
    "stadium": row.get("S_NM") or row.get("stadium") or "미정",
    "home_away": "HOME" if is_home else "AWAY",
    "hanwha_score": hanwha_score,
    "opponent_score": opp_score,
    "winner_team": winner,
    "game_status": row.get("GAME_SC_NM") or row.get("GAME_STATE") or row.get("gameStatus"),
    "game_start_time": game_start_time,
    "source": "KBO",
  }
  # GetScheduleList 기반 동기화에서는 선수 스탯이 빈 경우가 많아,
  # 기존 상세 스탯이 이미 저장된 경기라면 덮어쓰지 않도록 비어 있을 때는 전송하지 않습니다.
  if player_stats:
    payload["player_stats"] = player_stats
  return payload


def upsert_matches(supabase_url: str, service_role_key: str, rows: List[Dict[str, Any]]) -> None:
  endpoint = f"{supabase_url}/rest/v1/matches?on_conflict=game_date"
  headers = {
    "apikey": service_role_key,
    "Authorization": f"Bearer {service_role_key}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
  }
  batch_size = int(os.getenv("SUPABASE_UPSERT_BATCH_SIZE", "25"))
  groups: dict[tuple[str, ...], list[Dict[str, Any]]] = {}
  for row in rows:
    key = tuple(sorted(row.keys()))
    groups.setdefault(key, []).append(row)

  for _, grouped_rows in groups.items():
    for i in range(0, len(grouped_rows), batch_size):
      batch = grouped_rows[i : i + batch_size]
      resp = requests.post(endpoint, headers=headers, data=json.dumps(batch), timeout=30)
      if resp.status_code >= 400:
        preview = (resp.text or "")[:500]
        raise RuntimeError(
          f"Supabase upsert failed at batch starting {i} (size={len(batch)}): {resp.status_code} {preview}"
        )


def main() -> None:
  season = int(os.getenv("TARGET_SEASON", str(dt.date.today().year)))
  supabase_url = require_env("SUPABASE_URL")
  service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

  raw_rows = fetch_schedule_from_schedule_page(season)
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

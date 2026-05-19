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
STRIKEOUT_TOKEN_RE = re.compile(r"(\d+)?삼진")
STEAL_TOKEN_RE = re.compile(r"(\d+)?도루")
STEAL_TABLE_ETC_RE = re.compile(r"([^\s(,]+)\(\d+회")
HBP_TOKEN_RE = re.compile(r"(\d+)?사구")
PERCENT_PREFIX_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)%")
REGISTER_ALL_URL = "https://www.koreabaseball.com/Player/RegisterAll.aspx"
ROSTER_NAME_NUM_RE = re.compile(r"([가-힣A-Za-z][가-힣A-Za-z\.]{0,40})\((\d{1,2})\)")
SEARCH_PLAYER_URL = "https://www.koreabaseball.com/ws/Controls.asmx/GetSearchPlayer"
# GetSearchPlayer(name=성씨/이름) — 1군 등록현황에 없어도 KBO 등록 선수 조회 가능
ROSTER_SEARCH_PREFIXES = tuple(
  "김이박최정강조윤장임한오서신권황안송류홍문양배백허유남심노하곽성차주구민진지엄원천방공현변석설마길연위표명기반라왕금옥육인제모탁국여어은편용예경"
)
ROSTER_NEXT_TEAM_MARKERS = (
  "롯데",
  "두산",
  "KIA",
  "키움",
  "삼성",
  "SSG",
  "LG",
  "KT",
  "NC",
  "전체등록",
)


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


def _normalize_roster_player_name(name: str) -> str:
  return re.sub(r"\s+", "", (name or "").strip())


def _register_all_hanwha_map() -> Dict[str, int]:
  """1·2군 포함 전체 등록현황(RegisterAll) 한화 구간."""
  headers = {"User-Agent": "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)"}
  try:
    resp = requests.get(REGISTER_ALL_URL, headers=headers, timeout=60)
    resp.raise_for_status()
    if not resp.encoding or resp.encoding.lower() == "iso-8859-1":
      resp.encoding = resp.apparent_encoding or "utf-8"
    text = resp.text
  except Exception:
    return {}

  start = text.find("한화")
  if start < 0:
    return {}

  end = len(text)
  for team in ROSTER_NEXT_TEAM_MARKERS:
    pos = text.find(team, start + 10)
    if pos > start:
      end = min(end, pos)

  out: Dict[str, int] = {}
  for match in ROSTER_NAME_NUM_RE.finditer(text[start:end]):
    name = _normalize_roster_player_name(match.group(1))
    if len(name) < 2:
      continue
    out.setdefault(name, int(match.group(2)))
  return out


def _search_player_headers() -> Dict[str, str]:
  return {
    "User-Agent": "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.koreabaseball.com/Player/Search.aspx",
  }


def _lookup_hanwha_player_by_name(name: str) -> Tuple[str, int] | None:
  """KBO 선수검색 API — 1군 등록 명단에 없는 선수(예: 2군)도 BACK_NO 조회."""
  query = (name or "").strip()
  if len(query) < 2:
    return None
  try:
    resp = requests.post(
      SEARCH_PLAYER_URL,
      data={"name": query},
      headers=_search_player_headers(),
      timeout=20,
    )
    resp.raise_for_status()
    payload = resp.json()
  except Exception:
    return None

  if payload.get("code") != "100":
    return None

  for bucket in ("now", "retire"):
    for row in payload.get(bucket) or []:
      if row.get("T_ID") != "HH":
        continue
      player_name = _normalize_roster_player_name(row.get("P_NM"))
      back_no = parse_int(row.get("BACK_NO"))
      if player_name and back_no is not None:
        return player_name, back_no
  return None


def _merge_search_prefix_into_roster(out: Dict[str, int], prefix: str) -> None:
  prefix = (prefix or "").strip()
  if len(prefix) < 2:
    return
  try:
    resp = requests.post(
      SEARCH_PLAYER_URL,
      data={"name": prefix},
      headers=_search_player_headers(),
      timeout=20,
    )
    resp.raise_for_status()
    payload = resp.json()
  except Exception:
    return

  if payload.get("code") != "100":
    return

  for bucket in ("now", "retire"):
    for row in payload.get(bucket) or []:
      if row.get("T_ID") != "HH":
        continue
      player_name = _normalize_roster_player_name(row.get("P_NM"))
      back_no = parse_int(row.get("BACK_NO"))
      if player_name and back_no is not None:
        out[player_name] = back_no


def _collect_hanwha_names_from_player_stats(
  matches: List[Dict[str, Any]],
) -> set[str]:
  names: set[str] = set()
  for match in matches:
    for player in match.get("player_stats") or []:
      team = player.get("team_name") or ""
      if not any(k in team for k in HANWHA_KEYWORDS):
        continue
      player_name = (player.get("player_name") or "").strip()
      if player_name:
        names.add(player_name)
  return names


def fetch_hanwha_roster_number_map(
  extra_names: set[str] | None = None,
) -> Dict[str, int]:
  """
  한화 선수 등번호 맵.
  - RegisterAll(전체 등록)
  - 선수검색 API(성씨·이름·2글자 접두 — 1군 제외 선수 포함)
  - 경기 박스스코어에 등장한 선수 이름
  """
  out = _register_all_hanwha_map()

  prefixes: set[str] = set(ROSTER_SEARCH_PREFIXES)
  for name in list(out.keys()) + list(extra_names or []):
    normalized = _normalize_roster_player_name(name)
    if len(normalized) >= 2:
      prefixes.add(normalized[:2])
    if len(normalized) >= 3:
      prefixes.add(normalized[:3])

  for prefix in sorted(prefixes):
    _merge_search_prefix_into_roster(out, prefix)
    time.sleep(0.05)

  lookup_names: set[str] = set(out.keys()) | set(extra_names or [])
  for raw_name in sorted(lookup_names):
    found = _lookup_hanwha_player_by_name(raw_name)
    if found:
      canonical, back_no = found
      out[canonical] = back_no
    time.sleep(0.04)

  return dict(sorted(out.items(), key=lambda item: item[0]))


def write_hanwha_roster_json(
  target_path: str, roster: Dict[str, int] | None = None
) -> int:
  numbers = roster if roster is not None else fetch_hanwha_roster_number_map()
  os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
  with open(target_path, "w", encoding="utf-8") as handle:
    json.dump(numbers, handle, ensure_ascii=False, indent=2)
  return len(numbers)


def _attach_back_numbers(
  players: List[Dict[str, Any]], roster_map: Dict[str, int]
) -> List[Dict[str, Any]]:
  if not roster_map:
    return players
  for player in players:
    name = player.get("player_name")
    if not name:
      continue
    key = _normalize_roster_player_name(name)
    number = roster_map.get(key)
    if number is not None:
      player["back_number"] = number
  return players


def _extract_boxscore_team_tables(
  game_id: str, season: int, sr_id: str = "0"
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any] | None] | None:
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
  table_etc_raw = payload.get("tableEtc")
  table_etc: dict[str, Any] | None = None
  if table_etc_raw:
    try:
      table_etc = json.loads(table_etc_raw) if isinstance(table_etc_raw, str) else table_etc_raw
    except Exception:
      table_etc = None
  return hitters, pitchers, table_etc


def _fetch_get_box_score_payload(
  game_id: str, season: int, sr_id: str = "0"
) -> dict[str, Any] | None:
  """게임센터 통합 박스스코어 — 타자 표에 경기별 득점 열이 포함됩니다(GetBoxScoreScroll table1에는 없음)."""
  endpoint = "https://www.koreabaseball.com/ws/Schedule.asmx/GetBoxScore"
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
  if not isinstance(payload, dict) or not payload.get("tables"):
    return None
  return payload


def _parse_batter_lines_from_boxscore_table(
  table: dict[str, Any],
) -> dict[str, dict[str, int]]:
  """GetBoxScore 타자 표 — 마지막 5열: 타수·안타·타점·득점·타율(시즌)."""
  out: dict[str, dict[str, int]] = {}
  for block in table.get("rows") or []:
    cells = block.get("row") or []
    if len(cells) < 8:
      continue
    vals = [_clean_cell_text(c.get("Text")) for c in cells]
    order = vals[0] if vals else ""
    name = vals[2] if len(vals) > 2 else ""
    if not name or not order.isdigit():
      continue
    ab = parse_int(vals[-5])
    hits = parse_int(vals[-4])
    rbi = parse_int(vals[-3])
    runs = parse_int(vals[-2])
    out[name] = {
      "at_bats": ab if ab is not None else 0,
      "hits": hits if hits is not None else 0,
      "rbi": rbi if rbi is not None else 0,
      "runs": runs if runs is not None else 0,
    }
  return out


def _merge_batter_lines_from_get_box_score(
  batters: list[dict[str, Any]], lines: dict[str, dict[str, int]]
) -> None:
  for player in batters:
    if player.get("position_type") != "batter":
      continue
    name = player.get("player_name")
    if not name:
      continue
    line = lines.get(name)
    if not line:
      continue
    player["at_bats"] = line["at_bats"]
    player["hits"] = line["hits"]
    player["rbi"] = line["rbi"]
    player["runs"] = line["runs"]


def _parse_steals_from_table_etc(table_etc: dict[str, Any] | None) -> dict[str, int]:
  """게임 요약(tableEtc)의 '도루' 행 — KBO는 타석별 이벤트(table2)에 도루를 넣지 않습니다."""
  if not table_etc:
    return {}
  counts: dict[str, int] = {}
  for row in table_etc.get("rows") or []:
    cells = row.get("row") or []
    if len(cells) < 2:
      continue
    if _clean_cell_text(cells[0].get("Text")) != "도루":
      continue
    text = _clean_cell_text(cells[1].get("Text"))
    for name in STEAL_TABLE_ETC_RE.findall(text):
      counts[name] = counts.get(name, 0) + 1
  return counts


def _apply_hanwha_stolen_bases(
  batters: list[dict[str, Any]], steal_counts: dict[str, int]
) -> None:
  if not steal_counts:
    return
  for player in batters:
    name = player.get("player_name")
    if name in steal_counts:
      player["stolen_bases"] = steal_counts[name]


def _count_event_tokens(team_table: dict[str, Any], token_re: re.Pattern[str]) -> int:
  try:
    t2 = json.loads(team_table["table2"])
  except Exception:
    return 0
  total = 0
  for row in t2.get("rows") or []:
    ev_cells = row.get("row") or []
    ev_text = " ".join(_clean_cell_text(c.get("Text")) for c in ev_cells)
    for m in token_re.finditer(ev_text):
      total += int(m.group(1)) if m.group(1) else 1
  return total


def _player_stats_has_boxscore_detail(players: list[dict[str, Any]]) -> bool:
  for player in players:
    if player.get("position_type") == "batter" and (player.get("at_bats") or 0) > 0:
      return True
    if player.get("position_type") == "pitcher" and player.get("innings_pitched_outs"):
      return True
  return False


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

    # table3: [타수, 안타, 타점, 볼넷, 타율] 구조 (득점은 GetBoxScore에서 병합)
    at_bats = parse_int(_clean_cell_text(row3[0].get("Text")))
    hits = parse_int(_clean_cell_text(row3[1].get("Text")))
    rbi = parse_int(_clean_cell_text(row3[2].get("Text")))
    walks = parse_int(_clean_cell_text(row3[3].get("Text")))
    batting_avg = parse_float(_clean_cell_text(row3[4].get("Text")))

    home_runs = 0
    doubles = 0
    triples = 0
    strikeouts = 0
    stolen_bases = 0
    if i < len(r2):
      ev_cells = r2[i].get("row") or []
      ev_text = " ".join(_clean_cell_text(c.get("Text")) for c in ev_cells)
      for m in HR_TOKEN_RE.finditer(ev_text):
        home_runs += int(m.group(1)) if m.group(1) else 1
      for m in DOUBLE_TOKEN_RE.finditer(ev_text):
        doubles += int(m.group(1)) if m.group(1) else 1
      for m in TRIPLE_TOKEN_RE.finditer(ev_text):
        triples += int(m.group(1)) if m.group(1) else 1
      for m in STRIKEOUT_TOKEN_RE.finditer(ev_text):
        strikeouts += int(m.group(1)) if m.group(1) else 1
      for m in STEAL_TOKEN_RE.finditer(ev_text):
        stolen_bases += int(m.group(1)) if m.group(1) else 1

    plate_appearances = None
    if at_bats is not None and walks is not None:
      plate_appearances = at_bats + walks

    out.append(
      {
        "player_name": player_name,
        "team_name": team_name,
        "position_type": "batter",
        "wpa": None,
        "batting_avg": batting_avg,
        "plate_appearances": plate_appearances,
        "at_bats": at_bats if at_bats is not None else 0,
        "hits": hits if hits is not None else 0,
        "doubles": doubles,
        "triples": triples,
        "home_runs": home_runs,
        "rbi": rbi if rbi is not None else 0,
        "runs": 0,
        "walks": walks if walks is not None else 0,
        "strikeouts": strikeouts,
        "stolen_bases": stolen_bases,
        "ops": None,
      }
    )
  return out


def _parse_innings_to_outs(value: str) -> int | None:
  """KBO 이닝 표기 → 아웃카운트 (예: '5 1/3', '5.1', '5')."""
  s = (value or "").strip()
  if not s:
    return None
  if " " in s:
    whole, frac = s.split(" ", 1)
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
  if "." in s and "/" not in s:
    whole, frac_s = s.split(".", 1)
    whole_n = parse_int(whole)
    if whole_n is None:
      return None
    outs = whole_n * 3
    if frac_s.startswith("1"):
      outs += 1
    elif frac_s.startswith("2"):
      outs += 2
    return outs
  if "/" in s:
    frac = s.strip()
    if frac == "1/3":
      return 1
    if frac == "2/3":
      return 2
    return None
  whole_n = parse_int(s)
  if whole_n is None:
    return None
  return whole_n * 3


def _estimate_batter_game_wpa(player: dict[str, Any]) -> float:
  """키플레이어 WPA에 없을 때 박스 기록 기반 추정 WPA(대략 0~30 스케일)."""
  ab = player.get("at_bats") or 0
  hits = player.get("hits") or 0
  walks = player.get("walks") or 0
  if ab <= 0 and hits <= 0 and walks <= 0:
    return 0.0
  hr = player.get("home_runs") or 0
  doubles = player.get("doubles") or 0
  triples = player.get("triples") or 0
  rbi = player.get("rbi") or 0
  runs = player.get("runs") or 0
  singles = max(0, hits - hr - doubles - triples)
  outs = max(0, ab - hits)
  raw = (
    singles * 1.1
    + doubles * 2.2
    + triples * 3.3
    + hr * 4.4
    + walks * 0.9
    + rbi * 1.4
    + runs * 1.3
    - outs * 0.35
  )
  return round(max(0.0, raw), 1)


def _estimate_pitcher_game_wpa(player: dict[str, Any]) -> float:
  outs = player.get("innings_pitched_outs")
  if outs is None:
    outs = _parse_innings_to_outs(str(player.get("innings_pitched") or ""))
  outs = outs or 0
  er = player.get("earned_runs") or 0
  strikeouts = player.get("strikeouts") or 0
  hits_allowed = player.get("hits_allowed") or 0
  walks_allowed = player.get("walks_allowed") or 0
  if outs <= 0 and strikeouts <= 0 and er <= 0 and hits_allowed <= 0:
    return 0.0
  raw = (
    outs * 0.55
    + strikeouts * 0.45
    - er * 1.8
    - hits_allowed * 0.35
    - walks_allowed * 0.4
  )
  if player.get("wins"):
    raw += 2.5
  if player.get("saves"):
    raw += 2.0
  if player.get("holds"):
    raw += 1.2
  return round(max(0.0, raw), 1)


def _lookup_metric_map(metric_map: dict[str, float], player_name: str) -> float | None:
  if not metric_map or not player_name:
    return None
  if player_name in metric_map:
    return metric_map[player_name]
  target = _normalize_roster_player_name(player_name)
  for key, val in metric_map.items():
    if _normalize_roster_player_name(key) == target:
      return val
  return None


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
    # KBO 투수표: 선수명,등판,결과,승,패,세,이닝,타자,투구수,타수,피안타,홈런,4사구,삼진,실점,자책,평균자책점
    innings_outs = _parse_innings_to_outs(vals[6])
    at_bats_faced = parse_int(vals[7])
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
        "wpa": None,
        "era": era,
        "innings_pitched": vals[6],
        "innings_pitched_outs": innings_outs,
        "at_bats_faced": at_bats_faced if at_bats_faced is not None else 0,
        "hits_allowed": hits_allowed if hits_allowed is not None else 0,
        "home_runs_allowed": home_runs_allowed if home_runs_allowed is not None else 0,
        "walks_allowed": walks_allowed if walks_allowed is not None else 0,
        "hit_by_pitch": 0,
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


def _assign_game_hit_by_pitch(
  pitchers: list[dict[str, Any]], hbp_count: int
) -> None:
  if hbp_count <= 0 or not pitchers:
    return
  target = max(pitchers, key=lambda p: p.get("innings_pitched_outs") or 0)
  target["hit_by_pitch"] = hbp_count
  walks = target.get("walks_allowed") or 0
  if walks >= hbp_count:
    target["walks_allowed"] = walks - hbp_count


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
      ops_val = _lookup_metric_map(hitter_ops, name)
      if ops_val is not None:
        player["ops"] = ops_val
      # KBO 키플레이어 API의 GAME_WPA_RT(경기 WPA). 없으면 박스스코어 기반 추정치.
      wpa_val = _lookup_metric_map(hitter_wpa, name)
      if wpa_val is not None:
        player["wpa"] = wpa_val
      elif player.get("wpa") is None:
        player["wpa"] = _estimate_batter_game_wpa(player)
    elif player.get("position_type") == "pitcher":
      wpa_val = _lookup_metric_map(pitcher_wpa, name)
      if wpa_val is not None:
        player["wpa"] = wpa_val
      elif player.get("wpa") is None:
        player["wpa"] = _estimate_pitcher_game_wpa(player)
  return players


def build_player_stats_from_kbo_row(
  row: Dict[str, Any],
  is_home: bool,
  han_won: bool | None,
  season: int,
  roster_map: Dict[str, int] | None = None,
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
      hitters, pitchers, table_etc = team_tables
      han_idx = 1 if is_home else 0
      if han_idx < len(hitters) and han_idx < len(pitchers):
        parsed = _extract_hanwha_hitter_stats(hitters[han_idx], "한화 이글스")
        han_batters = [p for p in parsed if p.get("position_type") == "batter"]
        box_payload = _fetch_get_box_score_payload(game_id, season, sr_id)
        if box_payload:
          tables = box_payload.get("tables") or []
          batter_table_idx = 2 if is_home else 1
          if batter_table_idx < len(tables):
            lines = _parse_batter_lines_from_boxscore_table(tables[batter_table_idx])
            _merge_batter_lines_from_get_box_score(han_batters, lines)
        _apply_hanwha_stolen_bases(han_batters, _parse_steals_from_table_etc(table_etc))
        parsed.extend(_extract_hanwha_pitcher_stats(pitchers[han_idx], "한화 이글스"))
        opp_idx = 1 - han_idx
        if opp_idx < len(hitters):
          hbp_thrown = _count_event_tokens(hitters[opp_idx], HBP_TOKEN_RE)
          game_pitchers = [p for p in parsed if p.get("position_type") == "pitcher"]
          _assign_game_hit_by_pitch(game_pitchers, hbp_thrown)
        if parsed and _player_stats_has_boxscore_detail(parsed):
          enriched = _enrich_with_key_player_metrics(parsed, game_id, sr_id)
          return _attach_back_numbers(enriched, roster_map or {})

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
  return _attach_back_numbers(deduped, roster_map or {})


def normalize_match(
  row: Dict[str, Any], season: int, roster_map: Dict[str, int] | None = None
) -> Dict[str, Any] | None:
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

  player_stats = build_player_stats_from_kbo_row(
    row, is_home, han_won, season, roster_map=roster_map
  )

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
  # 요약 스냅샷(이름만)으로 기존 박스스코어 스탯을 덮어쓰지 않습니다.
  if player_stats and _player_stats_has_boxscore_detail(player_stats):
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


def _load_local_env() -> None:
  """로컬 실행 시 .env.local / .env 을 읽습니다 (이미 설정된 변수는 덮어쓰지 않음)."""
  root = os.path.join(os.path.dirname(__file__), "..")
  for filename in (".env.local", ".env"):
    path = os.path.join(root, filename)
    if not os.path.isfile(path):
      continue
    with open(path, encoding="utf-8") as handle:
      for line in handle:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
          continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
          os.environ[key] = value


def main() -> None:
  _load_local_env()
  season = int(os.getenv("TARGET_SEASON", str(dt.date.today().year)))
  supabase_url = require_env("SUPABASE_URL")
  service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

  roster_path = os.getenv(
    "HANWHA_ROSTER_JSON",
    os.path.join(os.path.dirname(__file__), "..", "src", "data", "hanwhaRosterNumbers.json"),
  )

  roster_map = fetch_hanwha_roster_number_map()
  print(f"Hanwha roster (initial): {len(roster_map)} players")

  raw_rows = fetch_schedule_from_schedule_page(season)
  normalized: List[Dict[str, Any]] = []
  for row in raw_rows:
    normalized_row = normalize_match(row, season, roster_map=roster_map)
    if normalized_row:
      normalized.append(normalized_row)

  if not normalized:
    raise RuntimeError("No Hanwha games were parsed. Check endpoint or parser fields.")

  extra_names = _collect_hanwha_names_from_player_stats(normalized)
  roster_map = fetch_hanwha_roster_number_map(extra_names=extra_names)
  for match in normalized:
    stats = match.get("player_stats")
    if stats:
      _attach_back_numbers(stats, roster_map)

  roster_count = write_hanwha_roster_json(roster_path, roster=roster_map)
  print(f"Hanwha roster numbers updated: {roster_count} players -> {roster_path}")
  if "김서현" in roster_map:
    print(f"  e.g. 김서현 -> {roster_map['김서현']}번")

  upsert_matches(supabase_url, service_role_key, normalized)
  print(f"Upsert complete: {len(normalized)} matches")

  try:
    from sync_leaderboard import sync_leaderboard

    leaderboard_rows = sync_leaderboard()
    print(f"Leaderboard sync complete: {len(leaderboard_rows)} members")
  except Exception as exc:
    print(f"Leaderboard sync skipped: {exc}")


if __name__ == "__main__":
  main()

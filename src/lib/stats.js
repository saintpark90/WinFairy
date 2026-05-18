import { getKoreanDayMark, isKoreanPublicHolidayMark } from './koreanHolidays'

const HANWHA_NAME = '한화'

/** KBO 일정 `S_NM` 기준 구단 홈 구장 9곳. 직관이 없어도 0경기로 표시합니다. */
const KBO_STADIUM_ORDER = [
  '잠실',
  '고척',
  '문학',
  '수원',
  '대구',
  '사직',
  '광주',
  '대전',
  '창원',
]

const pct = (wins, total) => {
  if (!total) return 0
  return Number(((wins / total) * 100).toFixed(1))
}

/** 직관일 입력 달력의 빨간날(법정 공휴일·공휴 겸 국경일)과 동일 기준으로 주말(공휴일) 집계 */
const dayBucket = (dateString) => {
  if (!dateString) return '평일'
  const iso = String(dateString).slice(0, 10)
  const day = new Date(`${iso}T12:00:00`).getDay()
  const isWeekend = day === 0 || day === 6
  const isPublicHoliday = isKoreanPublicHolidayMark(getKoreanDayMark(iso))
  if (isWeekend || isPublicHoliday) return '주말(공휴일)'
  return '평일'
}

/** 경기 취소·노게임 등(승패·달력의 '경기 전'과 구분). `game_status`는 KBO 일정 비고 등에서 옵니다. */
export const isMatchCancelled = (match) => {
  if (!match?.game_status) return false
  const s = String(match.game_status)
  return /취소|노게임|무효|제외/.test(s)
}

/** 승패가 확정된 경기만 집계에 사용합니다. */
export const isMatchDecided = (match) => {
  if (!match) return false
  if (isMatchCancelled(match)) return false
  const w = match.winner_team
  if (w != null && String(w).trim() !== '') return true
  if (
    typeof match.hanwha_score === 'number' &&
    typeof match.opponent_score === 'number'
  ) {
    return true
  }
  return false
}

const isDraw = (match) => {
  if (!isMatchDecided(match)) return false
  if (
    typeof match.hanwha_score === 'number' &&
    typeof match.opponent_score === 'number'
  ) {
    return match.hanwha_score === match.opponent_score
  }
  return match.winner_team?.includes('무') === true
}

export const isHanwhaWin = (match) => {
  if (!isMatchDecided(match)) return false
  if (isDraw(match)) return false
  if (!match?.winner_team) return false
  return match.winner_team.includes(HANWHA_NAME)
}

const isHanwhaLoss = (match) =>
  isMatchDecided(match) && !isHanwhaWin(match) && !isDraw(match)

/** 달력·뱃지용: `none`은 경기 행 없음(직관 예정만). `cancelled`는 취소·노게임 등. */
export const getMatchResultKind = (match) => {
  if (!match) return 'none'
  if (isMatchCancelled(match)) return 'cancelled'
  if (!isMatchDecided(match)) return 'pending'
  if (isDraw(match)) return 'draw'
  if (isHanwhaWin(match)) return 'win'
  return 'loss'
}

/** 승률 내림차순, 동률이면 경기 수·승 수, 그다음 구분명(가나다) */
const sortRowsByWinRateDesc = (rows) =>
  [...rows].sort(
    (a, b) =>
      b.winRate - a.winRate ||
      b.total - a.total ||
      b.wins - a.wins ||
      String(a.label).localeCompare(String(b.label), 'ko'),
  )

/** 승패 확정 경기만 집계합니다. */
const buildGroupRows = (records, keySelector) => {
  const bucket = new Map()
  records.forEach((record) => {
    if (!record.match || !isMatchDecided(record.match)) return
    const key = keySelector(record)
    const current = bucket.get(key) ?? { label: key, total: 0, wins: 0, losses: 0, draws: 0 }
    current.total += 1
    if (isHanwhaWin(record.match)) current.wins += 1
    else if (isHanwhaLoss(record.match)) current.losses += 1
    else if (isDraw(record.match)) current.draws += 1
    bucket.set(key, current)
  })

  const rows = [...bucket.values()].map((row) => ({
    ...row,
    winRate: pct(row.wins, row.total),
  }))
  return sortRowsByWinRateDesc(rows)
}

const buildStadiumRows = (records) => {
  const bucket = new Map()
  records.forEach((record) => {
    if (!record.match || !isMatchDecided(record.match)) return
    const key = record.match.stadium || '미상'
    const current = bucket.get(key) ?? { label: key, total: 0, wins: 0, losses: 0, draws: 0 }
    current.total += 1
    if (isHanwhaWin(record.match)) current.wins += 1
    else if (isHanwhaLoss(record.match)) current.losses += 1
    else if (isDraw(record.match)) current.draws += 1
    bucket.set(key, current)
  })

  const withRates = [...bucket.values()].map((row) => ({
    ...row,
    winRate: pct(row.wins, row.total),
  }))
  const dataMap = new Map(withRates.map((r) => [r.label, r]))

  const ordered = KBO_STADIUM_ORDER.map((name) => {
    const existing = dataMap.get(name)
    if (existing) {
      dataMap.delete(name)
      return existing
    }
    return { label: name, total: 0, wins: 0, losses: 0, draws: 0, winRate: 0 }
  })

  const extras = [...dataMap.values()]
  return sortRowsByWinRateDesc([...ordered, ...extras])
}

/** `matches.opponent_team` 짧은 이름(`fetch_kbo_2026.py`의 TEAM_ID_TO_NAME). 한화 제외 9구단. */
const KBO_OPPONENT_ORDER = ['LG', '두산', 'KIA', '롯데', '삼성', '키움', 'SSG', 'KT', 'NC']

const addMatchRunsToOpponentRow = (row, match) => {
  if (
    typeof match.hanwha_score !== 'number' ||
    typeof match.opponent_score !== 'number'
  ) {
    return
  }
  row.runsScored += match.hanwha_score
  row.runsAllowed += match.opponent_score
  row.scoredGames += 1
}

const emptyOpponentRow = (label) => ({
  label,
  total: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  runsScored: 0,
  runsAllowed: 0,
  scoredGames: 0,
})

const buildOpponentRows = (records) => {
  const bucket = new Map()
  records.forEach((record) => {
    if (!record.match || !isMatchDecided(record.match)) return
    const key = (record.match.opponent_team || '미상').trim()
    const current = bucket.get(key) ?? emptyOpponentRow(key)
    current.total += 1
    if (isHanwhaWin(record.match)) current.wins += 1
    else if (isHanwhaLoss(record.match)) current.losses += 1
    else if (isDraw(record.match)) current.draws += 1
    addMatchRunsToOpponentRow(current, record.match)
    bucket.set(key, current)
  })

  const withRates = [...bucket.values()].map((row) => ({
    ...row,
    winRate: pct(row.wins, row.total),
  }))
  const dataMap = new Map(withRates.map((r) => [r.label, r]))

  const ordered = KBO_OPPONENT_ORDER.map((name) => {
    const existing = dataMap.get(name)
    if (existing) {
      dataMap.delete(name)
      return existing
    }
    return { ...emptyOpponentRow(name), winRate: 0 }
  })

  const extras = [...dataMap.values()]
  return sortRowsByWinRateDesc([...ordered, ...extras])
}

const toNumOrNull = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const normalizePlayerName = (name) => String(name || '').replace(/\s+/g, '').trim()

/** KBO 이닝 문자열 → 아웃카운트 (예: '5 1/3', '5.1', '5') */
export const parseInningsPitchedToOuts = (value) => {
  if (value == null) return null
  const s = String(value).trim()
  if (!s) return null
  if (s.includes(' ')) {
    const [whole, frac] = s.split(/\s+/, 2)
    const wholeN = toNumOrNull(whole)
    if (wholeN == null) return null
    let outs = wholeN * 3
    const f = (frac || '').trim()
    if (f === '1/3') outs += 1
    else if (f === '2/3') outs += 2
    return outs
  }
  if (s.includes('.') && !s.includes('/')) {
    const [whole, fracS] = s.split('.', 2)
    const wholeN = toNumOrNull(whole)
    if (wholeN == null) return null
    let outs = wholeN * 3
    if (fracS.startsWith('1')) outs += 1
    else if (fracS.startsWith('2')) outs += 2
    return outs
  }
  if (s.includes('/')) {
    if (s === '1/3') return 1
    if (s === '2/3') return 2
    return null
  }
  const wholeN = toNumOrNull(s)
  if (wholeN == null) return null
  return wholeN * 3
}

const resolveInningsPitchedOuts = (player) => {
  const outs = toNumOrNull(player?.innings_pitched_outs)
  if (outs != null) return outs
  const raw = player?.innings_pitched ?? player?.innings ?? player?.ip
  if (raw == null) return null
  return parseInningsPitchedToOuts(raw)
}

const estimateBatterGameWar = (player) => {
  const ab = toNumOrNull(player?.at_bats ?? player?.ab) ?? 0
  const hits = toNumOrNull(player?.hits ?? player?.h) ?? 0
  const walks = toNumOrNull(player?.walks ?? player?.bb) ?? 0
  if (ab <= 0 && hits <= 0 && walks <= 0) return 0
  const hr = toNumOrNull(player?.home_runs ?? player?.hr) ?? 0
  const doubles = toNumOrNull(player?.doubles) ?? 0
  const triples = toNumOrNull(player?.triples) ?? 0
  const rbi = toNumOrNull(player?.rbi) ?? 0
  const runs = toNumOrNull(player?.runs ?? player?.runs_scored ?? player?.r) ?? 0
  const singles = Math.max(0, hits - hr - doubles - triples)
  const outs = Math.max(0, ab - hits)
  const raw =
    singles * 1.1 +
    doubles * 2.2 +
    triples * 3.3 +
    hr * 4.4 +
    walks * 0.9 +
    rbi * 1.4 +
    runs * 1.3 -
    outs * 0.35
  return Number(Math.max(0, raw).toFixed(1))
}

const estimatePitcherGameWar = (player) => {
  const outs = resolveInningsPitchedOuts(player) ?? 0
  const er = toNumOrNull(player?.earned_runs ?? player?.er) ?? 0
  const strikeouts = toNumOrNull(player?.strikeouts ?? player?.so) ?? 0
  const hitsAllowed = toNumOrNull(player?.hits_allowed) ?? 0
  const walksAllowed = toNumOrNull(player?.walks_allowed ?? player?.bb) ?? 0
  if (outs <= 0 && strikeouts <= 0 && er <= 0 && hitsAllowed <= 0) return 0
  let raw =
    outs * 0.55 + strikeouts * 0.45 - er * 1.8 - hitsAllowed * 0.35 - walksAllowed * 0.4
  if (toNumOrNull(player?.wins)) raw += 2.5
  if (toNumOrNull(player?.saves)) raw += 2
  if (toNumOrNull(player?.holds)) raw += 1.2
  return Number(Math.max(0, raw).toFixed(1))
}

const extractPlayerWar = (player) => {
  const fromApi = toNumOrNull(player?.war ?? player?.wpa ?? player?.game_wpa ?? player?.GAME_WPA_RT)
  if (fromApi != null) return fromApi
  if (player?.position_type === 'pitcher') return estimatePitcherGameWar(player)
  if (player?.position_type === 'batter') return estimateBatterGameWar(player)
  return null
}

/** 투수 이닝: 이닝 아웃카운트 합 → 야구 표기 (예: 5.0, 5.1) */
export const formatInningsFromOuts = (outs) => {
  if (outs == null || !Number.isFinite(outs) || outs < 0) return '-'
  const full = Math.floor(outs / 3)
  const rem = outs % 3
  if (rem === 0) return `${full}.0`
  return `${full}.${rem}`
}

/** 타율 표기 — 소수 셋째 자리 고정 (예: 0.200) */
export const formatBattingAvg = (value) => {
  if (value == null || Number.isNaN(value)) return '-'
  if (typeof value === 'number') return value.toFixed(3)
  return String(value)
}

/** ERA — 0 포함 항상 소수 둘째 자리 (예: 0.00) */
export const formatEra = (value) => {
  if (value == null || Number.isNaN(value)) return '-'
  if (typeof value === 'number') return value.toFixed(2)
  return String(value)
}

/** WAR(WPA) — 소수 첫째 자리 고정 (예: 0.0) */
export const formatWar = (value) => {
  if (value == null || Number.isNaN(value)) return '-'
  if (typeof value === 'number') return value.toFixed(1)
  return String(value)
}

/** 직관 경기 타수·안타 합으로 타율 계산 (KBO 박스 타율 열은 시즌 누적값인 경우가 많음) */
export const aggregateBattingAvgFromTotals = (hits, atBats) => {
  if (atBats == null || atBats <= 0) return null
  const h = hits ?? 0
  return Number((h / atBats).toFixed(3))
}

export const buildTopPlayers = (records, type, limit = 5) => {
  const stats = new Map()
  records.forEach((record) => {
    if (!record.match || !isMatchDecided(record.match)) return
    const players = record.match?.player_stats ?? []
    players
      .filter((player) => player.team_name?.includes(HANWHA_NAME))
      .filter((player) => player.position_type === type)
      .forEach((player) => {
        const key = player.player_name
        const current =
          stats.get(key) ??
          {
            playerName: key,
            games: 0,
            warTotal: 0,
            warSamples: 0,
            atBats: 0,
            opsTotal: 0,
            opsSamples: 0,
            hits: 0,
            homeRuns: 0,
            rbi: 0,
            runs: 0,
            walks: 0,
            plateAppearances: 0,
            earnedRuns: 0,
            inningsOuts: 0,
            wins: 0,
            holds: 0,
            saves: 0,
            strikeouts: 0,
          }

        current.games += 1
        const war = extractPlayerWar(player)
        if (war != null) {
          current.warTotal += war
          current.warSamples += 1
        }

        if (type === 'batter') {
          const ab = toNumOrNull(player.at_bats ?? player.ab)
          const hits = toNumOrNull(player.hits ?? player.h)
          const walks = toNumOrNull(player.walks ?? player.bb)
          if (ab != null) current.atBats += ab
          if (hits != null) current.hits += hits
          if (walks != null) current.walks += walks
          const pa = toNumOrNull(player.plate_appearances ?? player.pa)
          if (pa != null) {
            current.plateAppearances += pa
          } else if (ab != null && walks != null) {
            current.plateAppearances += ab + walks
          }
          const hr = toNumOrNull(player.home_runs ?? player.hr)
          if (hr != null) current.homeRuns += hr
          const rbi = toNumOrNull(player.rbi)
          if (rbi != null) current.rbi += rbi
          const runs = toNumOrNull(player.runs ?? player.runs_scored ?? player.r)
          if (runs != null) current.runs += runs
          const ops = toNumOrNull(player.ops)
          if (ops != null) {
            current.opsTotal += ops
            current.opsSamples += 1
          }
        } else {
          const strikeouts = toNumOrNull(player.strikeouts ?? player.so)
          if (strikeouts != null) current.strikeouts += strikeouts
          const inningOuts = resolveInningsPitchedOuts(player)
          if (inningOuts != null) current.inningsOuts += inningOuts
          const er = toNumOrNull(player.earned_runs ?? player.er)
          if (er != null) current.earnedRuns += er
          const wins = toNumOrNull(player.wins)
          if (wins != null) current.wins += wins
          const holds = toNumOrNull(player.holds)
          if (holds != null) current.holds += holds
          const saves = toNumOrNull(player.saves)
          if (saves != null) current.saves += saves
        }

        stats.set(key, current)
      })
  })

  return [...stats.values()]
    .map((player) => ({
      ...player,
      war: player.games > 0 ? Number(player.warTotal.toFixed(1)) : null,
      battingAvg:
        type === 'batter'
          ? aggregateBattingAvgFromTotals(player.hits, player.atBats)
          : null,
      plateAppearances: type === 'batter' ? player.plateAppearances : null,
      ops:
        player.opsSamples > 0 ? Number((player.opsTotal / player.opsSamples).toFixed(3)) : null,
      era:
        type === 'pitcher'
          ? player.inningsOuts > 0
            ? Number(((player.earnedRuns * 27) / player.inningsOuts).toFixed(2))
            : player.earnedRuns === 0
              ? 0
              : null
          : null,
    }))
    .sort((a, b) => {
      const aWar = a.war ?? -Infinity
      const bWar = b.war ?? -Infinity
      if (aWar !== bWar) return bWar - aWar
      if (type === 'pitcher') {
        const aEra = a.era ?? Infinity
        const bEra = b.era ?? Infinity
        if (aEra !== bEra) return aEra - bEra
      } else {
        const aAvg = a.battingAvg ?? -Infinity
        const bAvg = b.battingAvg ?? -Infinity
        if (aAvg !== bAvg) return bAvg - aAvg
      }
      return b.games - a.games
    })
    .slice(0, limit)
}

/** 직관일 기준 한화 선수 전원 (TOP N·검색용) */
export const buildAllAttendancePlayers = (records, type) =>
  buildTopPlayers(records, type, Number.POSITIVE_INFINITY)

export const buildDashboardStats = (attendanceRecords) => {
  const totalGames = attendanceRecords.length
  const decidedRecords = attendanceRecords.filter((row) => isMatchDecided(row.match))
  const decidedCount = decidedRecords.length
  const wins = decidedRecords.filter((row) => isHanwhaWin(row.match)).length
  const draws = decidedRecords.filter((row) => isDraw(row.match)).length
  const losses = decidedRecords.filter((row) => isHanwhaLoss(row.match)).length
  const winLossDenominator = wins + losses
  const winRate = pct(wins, winLossDenominator)

  return {
    summary: {
      totalGames,
      decidedGames: decidedCount,
      undecidedGames: totalGames - decidedCount,
      wins,
      losses,
      draws,
      winRate,
    },
    byStadium: buildStadiumRows(attendanceRecords),
    byHomeAway: buildGroupRows(attendanceRecords, (row) => {
      if (row.match.home_away === 'AWAY') return '원정경기'
      if (row.match.home_away === 'HOME') return '홈경기'
      return '미상'
    }),
    byWeekType: buildGroupRows(attendanceRecords, (row) =>
      dayBucket(row.match?.game_date || row.attended_at),
    ),
    byOpponent: buildOpponentRows(attendanceRecords),
    topBatters: buildTopPlayers(attendanceRecords, 'batter'),
    topPitchers: buildTopPlayers(attendanceRecords, 'pitcher'),
  }
}

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

/** 투수 이닝: 이닝 아웃카운트 합 → 야구 표기 (예: 5.1) */
export const formatInningsFromOuts = (outs) => {
  if (outs == null || !Number.isFinite(outs) || outs <= 0) return '-'
  const full = Math.floor(outs / 3)
  const rem = outs % 3
  if (rem === 0) return String(full)
  return `${full}.${rem}`
}

const buildTopPlayers = (records, type) => {
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
            avgTotal: 0,
            battingAvgSamples: 0,
            opsTotal: 0,
            opsSamples: 0,
            hits: 0,
            homeRuns: 0,
            rbi: 0,
            runs: 0,
            eraTotal: 0,
            eraSamples: 0,
            wins: 0,
            holds: 0,
            saves: 0,
            strikeouts: 0,
            inningsOuts: 0,
          }

        current.games += 1
        const war = toNumOrNull(player.war)
        if (war != null) {
          current.warTotal += war
          current.warSamples += 1
        }
        if (typeof player.batting_avg === 'number') {
          current.avgTotal += player.batting_avg
          current.battingAvgSamples += 1
        }
        const ops = toNumOrNull(player.ops)
        if (ops != null) {
          current.opsTotal += ops
          current.opsSamples += 1
        }
        const hits = toNumOrNull(player.hits)
        if (hits != null) current.hits += hits
        const hr = toNumOrNull(player.home_runs)
        if (hr != null) current.homeRuns += hr
        const rbi = toNumOrNull(player.rbi)
        if (rbi != null) current.rbi += rbi
        const runs = toNumOrNull(player.runs ?? player.runs_scored ?? player.r)
        if (runs != null) current.runs += runs
        const strikeouts = toNumOrNull(player.strikeouts ?? player.so)
        if (strikeouts != null) current.strikeouts += strikeouts
        const inningOuts = toNumOrNull(player.innings_pitched_outs)
        if (inningOuts != null) current.inningsOuts += inningOuts
        if (typeof player.era === 'number') {
          current.eraTotal += player.era
          current.eraSamples += 1
        }
        const wins = toNumOrNull(player.wins)
        if (wins != null) current.wins += wins
        const holds = toNumOrNull(player.holds)
        if (holds != null) current.holds += holds
        const saves = toNumOrNull(player.saves)
        if (saves != null) current.saves += saves
        stats.set(key, current)
      })
  })

  return [...stats.values()]
    .map((player) => ({
      ...player,
      war:
        player.warSamples > 0 ? Number((player.warTotal / player.warSamples).toFixed(2)) : null,
      battingAvg:
        player.battingAvgSamples > 0
          ? Number((player.avgTotal / player.battingAvgSamples).toFixed(3))
          : null,
      ops:
        player.opsSamples > 0 ? Number((player.opsTotal / player.opsSamples).toFixed(3)) : null,
      era:
        player.eraSamples > 0
          ? Number((player.eraTotal / player.eraSamples).toFixed(2))
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
        const aOps = a.ops ?? -Infinity
        const bOps = b.ops ?? -Infinity
        if (aOps !== bOps) return bOps - aOps
      }
      return b.games - a.games
    })
    .slice(0, 5)
}

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

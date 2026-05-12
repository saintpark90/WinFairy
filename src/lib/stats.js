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

const dayBucket = (dateString) => {
  const day = new Date(`${dateString}T12:00:00`).getDay()
  return day === 0 || day === 6 ? '주말' : '평일'
}

/** 승패가 확정된 경기만 집계에 사용합니다. */
export const isMatchDecided = (match) => {
  if (!match) return false
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

/** 달력·뱃지용: `none`은 경기 행 없음(직관 예정만). */
export const getMatchResultKind = (match) => {
  if (!match) return 'none'
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
    const current = bucket.get(key) ?? { label: key, total: 0, wins: 0 }
    current.total += 1
    current.wins += isHanwhaWin(record.match) ? 1 : 0
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
    const current = bucket.get(key) ?? { label: key, total: 0, wins: 0 }
    current.total += 1
    current.wins += isHanwhaWin(record.match) ? 1 : 0
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
    return { label: name, total: 0, wins: 0, winRate: 0 }
  })

  const extras = [...dataMap.values()]
  return sortRowsByWinRateDesc([...ordered, ...extras])
}

/** `matches.opponent_team` 짧은 이름(`fetch_kbo_2026.py`의 TEAM_ID_TO_NAME). 한화 제외 9구단. */
const KBO_OPPONENT_ORDER = ['LG', '두산', 'KIA', '롯데', '삼성', '키움', 'SSG', 'KT', 'NC']

const buildOpponentRows = (records) => {
  const bucket = new Map()
  records.forEach((record) => {
    if (!record.match || !isMatchDecided(record.match)) return
    const key = (record.match.opponent_team || '미상').trim()
    const current = bucket.get(key) ?? { label: key, total: 0, wins: 0 }
    current.total += 1
    current.wins += isHanwhaWin(record.match) ? 1 : 0
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
    return { label: name, total: 0, wins: 0, winRate: 0 }
  })

  const extras = [...dataMap.values()]
  return sortRowsByWinRateDesc([...ordered, ...extras])
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
            avgTotal: 0,
            battingAvgSamples: 0,
            eraTotal: 0,
            eraSamples: 0,
          }

        current.games += 1
        if (typeof player.batting_avg === 'number') {
          current.avgTotal += player.batting_avg
          current.battingAvgSamples += 1
        }
        if (typeof player.era === 'number') {
          current.eraTotal += player.era
          current.eraSamples += 1
        }
        stats.set(key, current)
      })
  })

  return [...stats.values()]
    .map((player) => ({
      ...player,
      battingAvg:
        player.battingAvgSamples > 0
          ? Number((player.avgTotal / player.battingAvgSamples).toFixed(3))
          : null,
      era:
        player.eraSamples > 0
          ? Number((player.eraTotal / player.eraSamples).toFixed(2))
          : null,
    }))
    .sort((a, b) => {
      if (type === 'pitcher') {
        if (a.era != null && b.era != null) {
          return a.era - b.era
        }
        if (a.era != null) return -1
        if (b.era != null) return 1
        return b.games - a.games
      }
      if (a.battingAvg != null && b.battingAvg != null) {
        if (a.battingAvg !== b.battingAvg) {
          return b.battingAvg - a.battingAvg
        }
      } else if (a.battingAvg != null) {
        return -1
      } else if (b.battingAvg != null) {
        return 1
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
    byHomeAway: buildGroupRows(attendanceRecords, (row) => row.match.home_away || '미상'),
    byWeekType: buildGroupRows(attendanceRecords, (row) =>
      dayBucket(row.match?.game_date || row.attended_at),
    ),
    byOpponent: buildOpponentRows(attendanceRecords),
    topBatters: buildTopPlayers(attendanceRecords, 'batter'),
    topPitchers: buildTopPlayers(attendanceRecords, 'pitcher'),
  }
}

const HANWHA_NAME = '한화'

const pct = (wins, total) => {
  if (!total) return 0
  return Number(((wins / total) * 100).toFixed(1))
}

const dayBucket = (dateString) => {
  const day = new Date(dateString).getDay()
  return day === 0 || day === 6 ? '주말' : '평일'
}

const isHanwhaWin = (match) => {
  if (!match?.winner_team) return false
  return match.winner_team.includes(HANWHA_NAME)
}

const buildGroupRows = (records, keySelector) => {
  const bucket = new Map()
  records.forEach((record) => {
    const key = keySelector(record)
    const current = bucket.get(key) ?? { label: key, total: 0, wins: 0 }
    current.total += 1
    current.wins += isHanwhaWin(record.match) ? 1 : 0
    bucket.set(key, current)
  })

  return [...bucket.values()]
    .map((row) => ({ ...row, winRate: pct(row.wins, row.total) }))
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total)
}

const buildTopPlayers = (records, type) => {
  const stats = new Map()
  records.forEach((record) => {
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
  const wins = attendanceRecords.filter((row) => isHanwhaWin(row.match)).length

  return {
    summary: {
      totalGames,
      wins,
      losses: totalGames - wins,
      winRate: pct(wins, totalGames),
    },
    byStadium: buildGroupRows(attendanceRecords, (row) => row.match.stadium || '미상'),
    byHomeAway: buildGroupRows(attendanceRecords, (row) => row.match.home_away || '미상'),
    byWeekType: buildGroupRows(attendanceRecords, (row) =>
      dayBucket(row.match.game_date),
    ),
    byOpponent: buildGroupRows(attendanceRecords, (row) => row.match.opponent_team || '미상'),
    topBatters: buildTopPlayers(attendanceRecords, 'batter'),
    topPitchers: buildTopPlayers(attendanceRecords, 'pitcher'),
  }
}

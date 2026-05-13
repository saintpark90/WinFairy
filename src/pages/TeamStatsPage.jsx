import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getMatchResultKind, isHanwhaWin, isMatchDecided } from '../lib/stats'
import { getOpponentTeamLogoUrl } from '../lib/teamLogos'

const HANWHA_TEAM_NAME = '한화이글스'

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

const toNumOrNull = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const formatGameDate = (isoDate) => {
  if (!isoDate) return '-'
  const d = new Date(`${isoDate}T12:00:00`)
  const w = WEEKDAY_KO[d.getDay()]
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${w})`
}

const matchResultShort = (match) => {
  const kind = getMatchResultKind(match)
  if (kind === 'win') return '승'
  if (kind === 'loss') return '패'
  if (kind === 'draw') return '무'
  if (kind === 'cancelled') return '취소'
  return '경기 전'
}

const scoreText = (match) => {
  if (!match) return '-'
  if (typeof match.hanwha_score !== 'number' || typeof match.opponent_score !== 'number') {
    return '-'
  }
  return `${match.hanwha_score}:${match.opponent_score}`
}

const formatValue = (value, digits = 3) => {
  if (value == null || Number.isNaN(value)) return '-'
  if (typeof value === 'number') {
    return value.toFixed(digits).replace(/\.?0+$/, '')
  }
  return String(value)
}

const sumByKeys = (players, keys) => {
  let sum = 0
  let found = false
  players.forEach((player) => {
    keys.forEach((key) => {
      const n = toNumOrNull(player?.[key])
      if (n != null) {
        sum += n
        found = true
      }
    })
  })
  return found ? sum : null
}

const avgByKeys = (players, keys, digits = 3) => {
  let total = 0
  let count = 0
  players.forEach((player) => {
    keys.forEach((key) => {
      const n = toNumOrNull(player?.[key])
      if (n != null) {
        total += n
        count += 1
      }
    })
  })
  if (!count) return null
  return Number((total / count).toFixed(digits))
}

function TeamStatsPage({ userId }) {
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        setError('Supabase 환경변수가 비어 있어 팀성적을 불러올 수 없습니다.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      const matchFields =
        'id, game_date, opponent_team, stadium, home_away, winner_team, player_stats, hanwha_score, opponent_score, game_start_time, game_status'

      const { data, error: attendanceError } = await supabase
        .from('user_attendance')
        .select(`attended_at, match_id, match:matches(${matchFields})`)
        .eq('user_id', userId)
        .order('attended_at', { ascending: false })

      if (attendanceError) {
        setError(attendanceError.message)
        setAttendanceRecords([])
      } else {
        setAttendanceRecords(data ?? [])
      }
      setLoading(false)
    }

    fetchData()
  }, [userId])

  const teamLogoUrl = useMemo(() => getOpponentTeamLogoUrl('한화'), [])

  const decidedMatches = useMemo(
    () =>
      attendanceRecords
        .map((row) => row.match)
        .filter((m) => m && isMatchDecided(m)),
    [attendanceRecords],
  )

  const teamPitching = useMemo(() => {
    const games = decidedMatches.length
    const wins = decidedMatches.filter((m) => isHanwhaWin(m)).length
    const draws = decidedMatches.filter(
      (m) =>
        typeof m.hanwha_score === 'number' &&
        typeof m.opponent_score === 'number' &&
        m.hanwha_score === m.opponent_score,
    ).length
    const losses = games - wins - draws
    const winRate = wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : 0

    const pitchers = decidedMatches.flatMap((m) =>
      (m.player_stats ?? []).filter(
        (p) => p?.position_type === 'pitcher' && String(p?.team_name || '').includes('한화'),
      ),
    )

    const saves = sumByKeys(pitchers, ['saves'])
    const holds = sumByKeys(pitchers, ['holds'])
    const hitsAllowed = sumByKeys(pitchers, ['hits_allowed', 'h_allowed', 'hitsAgainst'])
    const hrAllowed = sumByKeys(pitchers, ['home_runs_allowed', 'hr_allowed', 'homeRunsAllowed'])
    const walks = sumByKeys(pitchers, ['walks_allowed', 'bb', 'walks'])
    const hitByPitch = sumByKeys(pitchers, ['hit_by_pitch', 'hbp'])
    const strikeouts = sumByKeys(pitchers, ['strikeouts', 'so'])
    const runs =
      decidedMatches.reduce(
        (acc, m) => acc + (typeof m.opponent_score === 'number' ? m.opponent_score : 0),
        0,
      ) || null
    const earnedRuns = sumByKeys(pitchers, ['earned_runs', 'er'])

    const totalOuts = sumByKeys(pitchers, ['innings_pitched_outs'])
    let whip = null
    if (totalOuts != null && totalOuts > 0 && hitsAllowed != null && walks != null) {
      whip = Number(((hitsAllowed + walks) / (totalOuts / 3)).toFixed(2))
    } else {
      whip = avgByKeys(pitchers, ['whip'], 2)
    }

    return {
      games,
      wins,
      losses,
      draws,
      saves,
      holds,
      winRate,
      hitsAllowed,
      hrAllowed,
      walks,
      hitByPitch,
      strikeouts,
      runs,
      earnedRuns,
      whip,
    }
  }, [decidedMatches])

  const teamBatting = useMemo(() => {
    const games = decidedMatches.length
    const batters = decidedMatches.flatMap((m) =>
      (m.player_stats ?? []).filter(
        (p) => p?.position_type === 'batter' && String(p?.team_name || '').includes('한화'),
      ),
    )

    const atBats = sumByKeys(batters, ['at_bats', 'ab'])
    const walks = sumByKeys(batters, ['walks', 'bb'])
    let plateAppearances = sumByKeys(batters, ['plate_appearances', 'pa'])
    if (plateAppearances == null && atBats != null && walks != null) {
      plateAppearances = atBats + walks
    }

    return {
      battingAvg: avgByKeys(batters, ['batting_avg', 'avg'], 3),
      games,
      plateAppearances,
      atBats,
      runs:
        decidedMatches.reduce(
          (acc, m) => acc + (typeof m.hanwha_score === 'number' ? m.hanwha_score : 0),
          0,
        ) || null,
      hits: sumByKeys(batters, ['hits', 'h']),
      doubles: sumByKeys(batters, ['doubles', '2b']),
      triples: sumByKeys(batters, ['triples', '3b']),
      homeRuns: sumByKeys(batters, ['home_runs', 'hr']),
      rbi: sumByKeys(batters, ['rbi']),
    }
  }, [decidedMatches])

  const attendedMatchesForTable = useMemo(() => {
    const out = attendanceRecords
      .map((row) => row.match)
      .filter(Boolean)
      .sort((a, b) => String(b.game_date).localeCompare(String(a.game_date)))
    return out
  }, [attendanceRecords])

  return (
    <section className="team-stats-page">
      <div className="card team-stats-hero">
        {teamLogoUrl ? (
          <img
            src={teamLogoUrl}
            alt=""
            className="team-stats-emblem"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
        <h2>{HANWHA_TEAM_NAME} 팀성적</h2>
        <p className="muted">모든 수치는 내가 직관한 경기 기준입니다.</p>
      </div>

      {loading ? <p className="center-text">팀성적 데이터를 불러오는 중...</p> : null}
      {error ? <p className="center-text error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="card">
            <h3>팀 기록 (투수)</h3>
            <div className="table-wrap">
              <table className="team-stats-table">
                <thead>
                  <tr>
                    <th>경기</th>
                    <th>승리</th>
                    <th>패배</th>
                    <th>무승부</th>
                    <th>세이브</th>
                    <th>홀드</th>
                    <th>승률</th>
                    <th>피안타</th>
                    <th>홈런</th>
                    <th>볼넷</th>
                    <th>사구</th>
                    <th>삼진</th>
                    <th>실점</th>
                    <th>자책점</th>
                    <th>WHIP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{teamPitching.games}</td>
                    <td>{teamPitching.wins}</td>
                    <td>{teamPitching.losses}</td>
                    <td>{teamPitching.draws}</td>
                    <td>{formatValue(teamPitching.saves, 0)}</td>
                    <td>{formatValue(teamPitching.holds, 0)}</td>
                    <td>{teamPitching.winRate}%</td>
                    <td>{formatValue(teamPitching.hitsAllowed, 0)}</td>
                    <td>{formatValue(teamPitching.hrAllowed, 0)}</td>
                    <td>{formatValue(teamPitching.walks, 0)}</td>
                    <td>{formatValue(teamPitching.hitByPitch, 0)}</td>
                    <td>{formatValue(teamPitching.strikeouts, 0)}</td>
                    <td>{formatValue(teamPitching.runs, 0)}</td>
                    <td>{formatValue(teamPitching.earnedRuns, 0)}</td>
                    <td>{formatValue(teamPitching.whip, 2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>팀 기록 (타자)</h3>
            <div className="table-wrap">
              <table className="team-stats-table">
                <thead>
                  <tr>
                    <th>타율</th>
                    <th>경기</th>
                    <th>타석</th>
                    <th>타수</th>
                    <th>득점</th>
                    <th>안타</th>
                    <th>2루타</th>
                    <th>3루타</th>
                    <th>홈런</th>
                    <th>타점</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{formatValue(teamBatting.battingAvg)}</td>
                    <td>{teamBatting.games}</td>
                    <td>{formatValue(teamBatting.plateAppearances, 0)}</td>
                    <td>{formatValue(teamBatting.atBats, 0)}</td>
                    <td>{formatValue(teamBatting.runs, 0)}</td>
                    <td>{formatValue(teamBatting.hits, 0)}</td>
                    <td>{formatValue(teamBatting.doubles, 0)}</td>
                    <td>{formatValue(teamBatting.triples, 0)}</td>
                    <td>{formatValue(teamBatting.homeRuns, 0)}</td>
                    <td>{formatValue(teamBatting.rbi, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>직관 경기 결과</h3>
            {attendedMatchesForTable.length ? (
              <div className="table-wrap">
                <table className="team-stats-table team-stats-history">
                  <thead>
                    <tr>
                      <th>경기날짜</th>
                      <th>상대팀</th>
                      <th>승/패</th>
                      <th>스코어</th>
                      <th>경기장</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendedMatchesForTable.map((match) => {
                      const logo = getOpponentTeamLogoUrl(match.opponent_team)
                      return (
                        <tr key={match.id ?? `${match.game_date}-${match.opponent_team}`}>
                          <td>{formatGameDate(match.game_date)}</td>
                          <td>
                            <span className="team-stats-opponent-cell">
                              {logo ? (
                                <img
                                  className="team-logo-inline"
                                  src={logo}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : null}
                              <span>{match.opponent_team ?? '-'}</span>
                            </span>
                          </td>
                          <td>{matchResultShort(match)}</td>
                          <td>{scoreText(match)}</td>
                          <td>{match.stadium ?? '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">표시할 직관 경기 기록이 없습니다.</p>
            )}
          </section>
        </>
      ) : null}
    </section>
  )
}

export default TeamStatsPage

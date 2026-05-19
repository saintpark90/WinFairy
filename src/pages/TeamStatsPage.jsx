import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import AttendancePlayerRankings from '../components/AttendancePlayerRankings'
import {
  aggregateBattingAvgFromTotals,
  formatBattingAvg,
  isHanwhaWin,
  isMatchDecided,
} from '../lib/stats'
import { getOpponentTeamLogoUrl } from '../lib/teamLogos'

const HANWHA_TEAM_NAME = '한화이글스'

const toNumOrNull = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const formatValue = (value, digits = 3) => {
  if (value == null || Number.isNaN(value)) return '-'
  if (typeof value === 'number') {
    if (digits === 0) {
      return value.toFixed(0)
    }
    const s = value.toFixed(digits)
    const trimmed = s.replace(/\.?0+$/, '')
    return trimmed === '' ? '0' : trimmed
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

const computeTeamPitching = (decidedMatches) => {
  const games = decidedMatches.length
  const wins = decidedMatches.filter((m) => isHanwhaWin(m)).length
  const draws = decidedMatches.filter(
    (m) =>
      typeof m.hanwha_score === 'number' &&
      typeof m.opponent_score === 'number' &&
      m.hanwha_score === m.opponent_score,
  ).length
  const losses = games - wins - draws

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
    hitsAllowed,
    hrAllowed,
    walks,
    hitByPitch,
    strikeouts,
    runs,
    earnedRuns,
    whip,
  }
}

const computeTeamBatting = (decidedMatches) => {
  const games = decidedMatches.length
  const batters = decidedMatches.flatMap((m) =>
    (m.player_stats ?? []).filter(
      (p) => p?.position_type === 'batter' && String(p?.team_name || '').includes('한화'),
    ),
  )

  const atBats = sumByKeys(batters, ['at_bats', 'ab'])
  const hits = sumByKeys(batters, ['hits', 'h'])
  const walks = sumByKeys(batters, ['walks', 'bb'])
  let plateAppearances = sumByKeys(batters, ['plate_appearances', 'pa'])
  if (plateAppearances == null && atBats != null && walks != null) {
    plateAppearances = atBats + walks
  }

  return {
    battingAvg: aggregateBattingAvgFromTotals(hits, atBats),
    games,
    plateAppearances,
    atBats,
    runs:
      decidedMatches.reduce(
        (acc, m) => acc + (typeof m.hanwha_score === 'number' ? m.hanwha_score : 0),
        0,
      ) || null,
    hits,
    homeRuns: sumByKeys(batters, ['home_runs', 'hr']),
    rbi: sumByKeys(batters, ['rbi']),
    walksBatting: walks,
    strikeouts: sumByKeys(batters, ['strikeouts', 'so', 'strikeout']),
    stolenBases: sumByKeys(batters, ['stolen_bases', 'sb', 'stolen_base']),
  }
}

function TeamStatsPage({ userId }) {
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [allMatches, setAllMatches] = useState([])
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

      const [
        { data: attendanceRows, error: attendanceError },
        { data: matchesRows, error: matchesError },
      ] = await Promise.all([
        supabase
          .from('user_attendance')
          .select(`attended_at, match_id, match:matches(${matchFields})`)
          .eq('user_id', userId)
          .order('attended_at', { ascending: false }),
        supabase.from('matches').select(matchFields),
      ])

      const queryError = attendanceError || matchesError
      if (queryError) {
        setError(queryError.message)
        setAttendanceRecords([])
        setAllMatches([])
      } else {
        setAttendanceRecords(attendanceRows ?? [])
        setAllMatches(matchesRows ?? [])
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

  const allDecidedMatches = useMemo(
    () => (allMatches ?? []).filter((m) => m && isMatchDecided(m)),
    [allMatches],
  )

  const teamPitchingMine = useMemo(
    () => computeTeamPitching(decidedMatches),
    [decidedMatches],
  )
  const teamPitchingAll = useMemo(
    () => computeTeamPitching(allDecidedMatches),
    [allDecidedMatches],
  )

  const teamBattingMine = useMemo(
    () => computeTeamBatting(decidedMatches),
    [decidedMatches],
  )
  const teamBattingAll = useMemo(
    () => computeTeamBatting(allDecidedMatches),
    [allDecidedMatches],
  )

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
        <p className="muted">
          내가 직관한 경기에서는 선수들이 얼마나 잘했나 확인해보세요!
        </p>
      </div>

      {loading ? <p className="center-text">팀성적 데이터를 불러오는 중...</p> : null}
      {error ? <p className="center-text error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="card">
            <h3>팀 기록 (투수)</h3>
            <div className="table-wrap">
              <table className="team-stats-table team-stats-compare-table">
                <thead>
                  <tr>
                    <th scope="col">구분</th>
                    <th>경기</th>
                    <th>승리</th>
                    <th>패배</th>
                    <th>무승부</th>
                    <th>세이브</th>
                    <th>홀드</th>
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
                  <tr className="team-stats-row-mine">
                    <th scope="row">내 성적</th>
                    <td>{teamPitchingMine.games}</td>
                    <td>{teamPitchingMine.wins}</td>
                    <td>{teamPitchingMine.losses}</td>
                    <td>{teamPitchingMine.draws}</td>
                    <td>{formatValue(teamPitchingMine.saves, 0)}</td>
                    <td>{formatValue(teamPitchingMine.holds, 0)}</td>
                    <td>{formatValue(teamPitchingMine.hitsAllowed, 0)}</td>
                    <td>{formatValue(teamPitchingMine.hrAllowed, 0)}</td>
                    <td>{formatValue(teamPitchingMine.walks, 0)}</td>
                    <td>{formatValue(teamPitchingMine.hitByPitch, 0)}</td>
                    <td>{formatValue(teamPitchingMine.strikeouts, 0)}</td>
                    <td>{formatValue(teamPitchingMine.runs, 0)}</td>
                    <td>{formatValue(teamPitchingMine.earnedRuns, 0)}</td>
                    <td>{formatValue(teamPitchingMine.whip, 2)}</td>
                  </tr>
                  <tr className="team-stats-row-all">
                    <th scope="row">전체 성적</th>
                    <td>{teamPitchingAll.games}</td>
                    <td>{teamPitchingAll.wins}</td>
                    <td>{teamPitchingAll.losses}</td>
                    <td>{teamPitchingAll.draws}</td>
                    <td>{formatValue(teamPitchingAll.saves, 0)}</td>
                    <td>{formatValue(teamPitchingAll.holds, 0)}</td>
                    <td>{formatValue(teamPitchingAll.hitsAllowed, 0)}</td>
                    <td>{formatValue(teamPitchingAll.hrAllowed, 0)}</td>
                    <td>{formatValue(teamPitchingAll.walks, 0)}</td>
                    <td>{formatValue(teamPitchingAll.hitByPitch, 0)}</td>
                    <td>{formatValue(teamPitchingAll.strikeouts, 0)}</td>
                    <td>{formatValue(teamPitchingAll.runs, 0)}</td>
                    <td>{formatValue(teamPitchingAll.earnedRuns, 0)}</td>
                    <td>{formatValue(teamPitchingAll.whip, 2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>팀 기록 (타자)</h3>
            <div className="table-wrap">
              <table className="team-stats-table team-stats-compare-table">
                <thead>
                  <tr>
                    <th scope="col">구분</th>
                    <th>타율</th>
                    <th>경기</th>
                    <th>타석</th>
                    <th>타수</th>
                    <th>득점</th>
                    <th>안타</th>
                    <th>홈런</th>
                    <th>타점</th>
                    <th>볼넷</th>
                    <th>삼진</th>
                    <th>도루</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="team-stats-row-mine">
                    <th scope="row">내 성적</th>
                    <td>{formatBattingAvg(teamBattingMine.battingAvg)}</td>
                    <td>{teamBattingMine.games}</td>
                    <td>{formatValue(teamBattingMine.plateAppearances, 0)}</td>
                    <td>{formatValue(teamBattingMine.atBats, 0)}</td>
                    <td>{formatValue(teamBattingMine.runs, 0)}</td>
                    <td>{formatValue(teamBattingMine.hits, 0)}</td>
                    <td>{formatValue(teamBattingMine.homeRuns, 0)}</td>
                    <td>{formatValue(teamBattingMine.rbi, 0)}</td>
                    <td>{formatValue(teamBattingMine.walksBatting, 0)}</td>
                    <td>{formatValue(teamBattingMine.strikeouts, 0)}</td>
                    <td>{formatValue(teamBattingMine.stolenBases, 0)}</td>
                  </tr>
                  <tr className="team-stats-row-all">
                    <th scope="row">전체 성적</th>
                    <td>{formatBattingAvg(teamBattingAll.battingAvg)}</td>
                    <td>{teamBattingAll.games}</td>
                    <td>{formatValue(teamBattingAll.plateAppearances, 0)}</td>
                    <td>{formatValue(teamBattingAll.atBats, 0)}</td>
                    <td>{formatValue(teamBattingAll.runs, 0)}</td>
                    <td>{formatValue(teamBattingAll.hits, 0)}</td>
                    <td>{formatValue(teamBattingAll.homeRuns, 0)}</td>
                    <td>{formatValue(teamBattingAll.rbi, 0)}</td>
                    <td>{formatValue(teamBattingAll.walksBatting, 0)}</td>
                    <td>{formatValue(teamBattingAll.strikeouts, 0)}</td>
                    <td>{formatValue(teamBattingAll.stolenBases, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <AttendancePlayerRankings attendanceRecords={attendanceRecords} />
        </>
      ) : null}
    </section>
  )
}

export default TeamStatsPage

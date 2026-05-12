import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildDashboardStats } from '../lib/stats'
import { getOpponentTeamLogoUrl } from '../lib/teamLogos'

const StatSection = ({
  title,
  rows,
  showTeamLogoInLabel = false,
  sectionClassName = '',
  showRank = false,
}) => (
  <section className={['card', sectionClassName].filter(Boolean).join(' ')}>
    <h3>{title}</h3>
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showRank ? <th className="stat-rank-col">순위</th> : null}
            <th>구분</th>
            <th>경기</th>
            <th>승</th>
            <th>승률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const logoUrl = showTeamLogoInLabel ? getOpponentTeamLogoUrl(row.label) : null
            return (
              <tr key={row.label}>
                {showRank ? <td className="stat-rank-col">{index + 1}</td> : null}
                <td>
                  {showTeamLogoInLabel ? (
                    <span className="team-label-cell">
                      {logoUrl ? (
                        <img
                          className="team-logo-inline"
                          src={logoUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : null}
                      <span className="team-label-text">{row.label}</span>
                    </span>
                  ) : (
                    row.label
                  )}
                </td>
                <td>{row.total}</td>
                <td>{row.wins}</td>
                <td>{row.winRate}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </section>
)

function HomePage({ userId }) {
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        setError('Supabase 환경변수가 비어 있어 데이터를 불러올 수 없습니다.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      const matchFields =
        'id, game_date, stadium, opponent_team, home_away, winner_team, player_stats, hanwha_score, opponent_score'
      const [{ data: attendanceRows, error: attendanceError }, { data: allMatches, error: matchesError }] =
        await Promise.all([
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
      } else {
        const byDate = new Map((allMatches ?? []).map((m) => [m.game_date, m]))
        const enriched = (attendanceRows ?? []).map((row) => ({
          attended_at: row.attended_at,
          match_id: row.match_id,
          match: row.match ?? byDate.get(row.attended_at) ?? null,
        }))
        setAttendanceRecords(enriched)
      }
      setLoading(false)
    }

    fetchData()
  }, [userId])

  const stats = useMemo(
    () => buildDashboardStats(attendanceRecords),
    [attendanceRecords],
  )

  return (
    <div className="dashboard">
      {loading ? (
        <p className="center-text">통계 데이터를 불러오는 중...</p>
      ) : null}
      {error ? <p className="center-text error">{error}</p> : null}
      {!loading && !error && !attendanceRecords.length ? (
        <p className="center-text">
          아직 직관 입력 데이터가 없습니다. 상단 메뉴에서 직관일을 추가해 주세요.
        </p>
      ) : null}
      {!loading && !error && attendanceRecords.length ? (
        <>
          <section className="hero-card">
            <h2>내 승률</h2>
            <p className="big-number">{stats.summary.winRate}%</p>
            <p>
              {stats.summary.wins}승 {stats.summary.losses}패
              {stats.summary.draws > 0 ? ` ${stats.summary.draws}무` : ''} (승패 확정{' '}
              {stats.summary.decidedGames}경기) / 총 직관 {stats.summary.totalGames}경기
              {stats.summary.undecidedGames > 0
                ? ` · 미확정 ${stats.summary.undecidedGames}경기는 승률에 반영하지 않습니다`
                : ''}
            </p>
          </section>

          <div className="dashboard-stadium-row">
            <div className="dashboard-stadium-left">
              <StatSection
                title="경기장 별 승률"
                rows={stats.byStadium}
                sectionClassName="stat-card-stadium"
                showRank
              />
            </div>
            <div className="dashboard-stadium-right">
              <StatSection title="홈 / 원정 승률" rows={stats.byHomeAway} showRank />
              <StatSection
                title="평일 / 주말 승률"
                rows={stats.byWeekType}
                sectionClassName="stat-card-weekstretch"
                showRank
              />
            </div>
          </div>
          <StatSection
            title="상대팀 별 승률"
            rows={stats.byOpponent}
            showTeamLogoInLabel
            showRank
          />

          <section className="card grid2">
            <div>
              <h3>직관일 기준 타자 TOP5</h3>
              <p className="top5-hint">
                직관으로 기록한 경기의 KBO 경기 요약 선수 정보를 모아 집계합니다.
              </p>
              {stats.topBatters.length ? (
                <ul className="ranking">
                  {stats.topBatters.map((player) => (
                    <li key={player.playerName}>
                      <span>{player.playerName}</span>
                      <strong>
                        {player.battingAvg != null
                          ? `타율 ${player.battingAvg}`
                          : `직관 ${player.games}경기`}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">표시할 타자 기록이 없습니다.</p>
              )}
            </div>
            <div>
              <h3>직관일 기준 투수 TOP5</h3>
              <p className="top5-hint">
                선발·승·패·세이브 등 요약 기록이 있는 경기만 반영됩니다.
              </p>
              {stats.topPitchers.length ? (
                <ul className="ranking">
                  {stats.topPitchers.map((player) => (
                    <li key={player.playerName}>
                      <span>{player.playerName}</span>
                      <strong>
                        {player.era != null
                          ? `ERA ${player.era}`
                          : `직관 ${player.games}경기`}
                      </strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">표시할 투수 기록이 없습니다.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

export default HomePage

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildDashboardStats } from '../lib/stats'

const StatSection = ({ title, rows }) => (
  <section className="card">
    <h3>{title}</h3>
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>구분</th>
            <th>경기</th>
            <th>승</th>
            <th>승률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.total}</td>
              <td>{row.wins}</td>
              <td>{row.winRate}%</td>
            </tr>
          ))}
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
      setLoading(true)
      setError('')
      const { data, error: queryError } = await supabase
        .from('user_attendance')
        .select(
          'match_id, match:matches(game_date, stadium, opponent_team, home_away, winner_team, player_stats)',
        )
        .eq('user_id', userId)
        .order('attended_at', { ascending: false })

      if (queryError) {
        setError(queryError.message)
      } else {
        setAttendanceRecords(data ?? [])
      }
      setLoading(false)
    }

    fetchData()
  }, [userId])

  const stats = useMemo(
    () => buildDashboardStats(attendanceRecords),
    [attendanceRecords],
  )

  if (loading) return <p className="center-text">통계 데이터를 불러오는 중...</p>
  if (error) return <p className="center-text error">{error}</p>
  if (!attendanceRecords.length) {
    return (
      <p className="center-text">
        아직 직관 입력 데이터가 없습니다. 상단 메뉴에서 직관일을 추가해 주세요.
      </p>
    )
  }

  return (
    <div className="dashboard">
      <section className="hero-card">
        <h2>내 승률</h2>
        <p className="big-number">{stats.summary.winRate}%</p>
        <p>
          {stats.summary.wins}승 {stats.summary.losses}패 / 총 {stats.summary.totalGames}경기
        </p>
      </section>

      <StatSection title="경기장 별 승률" rows={stats.byStadium} />
      <StatSection title="홈 / 원정 승률" rows={stats.byHomeAway} />
      <StatSection title="평일 / 주말 승률" rows={stats.byWeekType} />
      <StatSection title="상대팀 별 승률" rows={stats.byOpponent} />

      <section className="card grid2">
        <div>
          <h3>직관일 기준 타자 TOP5</h3>
          <ul className="ranking">
            {stats.topBatters.map((player) => (
              <li key={player.playerName}>
                <span>{player.playerName}</span>
                <strong>타율 {player.battingAvg}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>직관일 기준 투수 TOP5</h3>
          <ul className="ranking">
            {stats.topPitchers.map((player) => (
              <li key={player.playerName}>
                <span>{player.playerName}</span>
                <strong>ERA {player.era ?? '-'}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

export default HomePage

import { useEffect, useMemo, useState } from 'react'
import {
  supabase,
  supabaseAnonKey,
  supabaseConfigError,
  supabaseUrl,
} from '../lib/supabase'
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
  const maskedAnonKey = useMemo(() => {
    if (!supabaseAnonKey) return '-'
    if (supabaseAnonKey.length <= 12) return supabaseAnonKey
    return `${supabaseAnonKey.slice(0, 8)}...${supabaseAnonKey.slice(-4)}`
  }, [])
  const dbConnectionInfo = useMemo(() => {
    const projectRef = supabaseUrl?.split('://')[1]?.split('.')[0] ?? '-'
    return [
      { label: 'Supabase URL', value: supabaseUrl ?? '-' },
      { label: 'Project Ref', value: projectRef },
      { label: 'Anon Key', value: maskedAnonKey },
      { label: 'Schema', value: 'public (matches, user_attendance)' },
      { label: 'Config Status', value: supabaseConfigError || 'OK' },
    ]
  }, [maskedAnonKey])

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        setError('Supabase 환경변수가 비어 있어 데이터를 불러올 수 없습니다.')
        setLoading(false)
        return
      }
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

  return (
    <div className="dashboard">
      <section className="card">
        <h3>DB 접속정보</h3>
        <ul className="ranking">
          {dbConnectionInfo.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
      </section>
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
        </>
      ) : null}
    </div>
  )
}

export default HomePage

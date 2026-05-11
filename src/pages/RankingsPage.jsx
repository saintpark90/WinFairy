import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

function RankingsPage({ userId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setError('Supabase 환경변수가 비어 있어 순위를 불러올 수 없습니다.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      const { data, error: rpcError } = await supabase.rpc(
        'get_attendance_leaderboard',
      )
      if (rpcError) {
        setError(rpcError.message)
        setRows([])
      } else {
        setRows(data ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const rankedRows = useMemo(
    () =>
      rows.map((row, index) => ({
        rank: index + 1,
        ...row,
        games: Number(row.games),
        wins: Number(row.wins),
        losses:
          Number(row.games) -
          Number(row.wins),
      })),
    [rows],
  )

  return (
    <section className="rankings-page">
      <div className="card">
        <h2>직관 승률 순위</h2>
        <p className="muted">
          직관으로 기록된 경기만 집계하며, 승률 → 승수 → 경기 수 순으로 정렬합니다.
        </p>

        {loading ? <p>순위를 불러오는 중...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {!loading && !error && !rankedRows.length ? (
          <p className="muted">아직 직관 데이터가 있는 회원이 없습니다.</p>
        ) : null}

        {!loading && !error && rankedRows.length ? (
          <div className="table-wrap rankings-table-wrap">
            <table className="rankings-table">
              <thead>
                <tr>
                  <th scope="col">순위</th>
                  <th scope="col">닉네임</th>
                  <th scope="col">경기</th>
                  <th scope="col">승</th>
                  <th scope="col">패·무등</th>
                  <th scope="col">승률</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map((row) => {
                  const isMe = Boolean(userId && row.user_id === userId)
                  return (
                    <tr
                      key={row.user_id}
                      className={isMe ? 'rankings-row-me' : undefined}
                    >
                      <td>{row.rank}</td>
                      <td>
                        <span className="rankings-name">{row.display_name}</span>
                      </td>
                      <td>{row.games}</td>
                      <td>{row.wins}</td>
                      <td>{Math.max(row.losses, 0)}</td>
                      <td>{Number(row.win_rate).toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default RankingsPage

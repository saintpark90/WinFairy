import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchAttendanceLeaderboard } from '../lib/leaderboard'
import { supabase } from '../lib/supabase'
import { optimizeAvatarUrl } from '../lib/userDisplay'

const RANKINGS_AVATAR_PX = 40

function RankingsUserCell({ displayName, avatarUrl }) {
  const [imgFailed, setImgFailed] = useState(false)
  const name = displayName || '회원'
  const initial = name.slice(0, 1)
  const avatarSrc = optimizeAvatarUrl(avatarUrl, RANKINGS_AVATAR_PX)
  const showImage = Boolean(avatarSrc) && !imgFailed

  return (
    <span className="rankings-user-cell">
      {showImage ? (
        <span className="rankings-user-avatar-wrap">
          <img
            className="rankings-user-avatar"
            src={avatarSrc}
            alt=""
            width={RANKINGS_AVATAR_PX}
            height={RANKINGS_AVATAR_PX}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
          />
        </span>
      ) : (
        <span
          className="rankings-user-avatar user-avatar user-avatar-fallback"
          aria-hidden
        >
          {initial}
        </span>
      )}
      <span className="rankings-name">{name}</span>
    </span>
  )
}

const SORTABLE_COLUMNS = [
  { key: 'games', label: '경기' },
  { key: 'wins', label: '승' },
  { key: 'losses', label: '패' },
  { key: 'draws', label: '무' },
  { key: 'win_rate', label: '승률' },
]

function SortableHeader({ column, sortKey, sortDir, onSort }) {
  const active = sortKey === column.key
  return (
    <th scope="col">
      <button
        type="button"
        className={`rankings-sort-button${active ? ' rankings-sort-button--active' : ''}`}
        onClick={() => onSort(column.key)}
        aria-sort={
          active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'
        }
      >
        <span className="rankings-sort-label">{column.label}</span>
        <span
          className={`rankings-sort-icon${active ? '' : ' rankings-sort-icon--placeholder'}`}
          aria-hidden
        >
          {active ? (sortDir === 'desc' ? '▼' : '▲') : '▼'}
        </span>
      </button>
    </th>
  )
}

function RankingsPage({ userId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('wins')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setError('Supabase 환경변수가 비어 있어 순위를 불러올 수 없습니다.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      const { data, error: loadError } = await fetchAttendanceLeaderboard(supabase)
      if (loadError) {
        setError(loadError.message)
        setRows([])
      } else {
        setRows(data ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDir((prevDir) => (prevDir === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }, [sortKey])

  const rankedRows = useMemo(() => {
    const prepared = rows.map((row) => ({
      ...row,
      games: Number(row.games),
      wins: Number(row.wins),
      losses: Number(row.losses ?? 0),
      draws: Number(row.draws ?? 0),
      win_rate: Number(row.win_rate),
    }))

    const direction = sortDir === 'desc' ? -1 : 1
    prepared.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey]
      if (diff !== 0) return diff * direction
      return String(a.display_name).localeCompare(String(b.display_name), 'ko')
    })

    return prepared.map((row, index) => ({
      ...row,
      rank: index + 1,
    }))
  }, [rows, sortKey, sortDir])

  return (
    <section className="rankings-page">
      <div className="card">
        <h2>승리기운 순위</h2>
        <p className="muted">
          수다방에서 누가 가장 승리요정일까요?
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
                  {SORTABLE_COLUMNS.map((column) => (
                    <SortableHeader
                      key={column.key}
                      column={column}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  ))}
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
                        <RankingsUserCell
                          displayName={row.display_name}
                          avatarUrl={row.avatar_url}
                        />
                      </td>
                      <td>{row.games}</td>
                      <td>{row.wins}</td>
                      <td>{row.losses}</td>
                      <td>{row.draws}</td>
                      <td>{row.win_rate.toFixed(1)}%</td>
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

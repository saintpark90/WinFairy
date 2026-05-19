import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAdminUser } from '../lib/admin'
import { fetchAttendanceLeaderboard } from '../lib/leaderboard'
import { LEADERBOARD_UPDATED_EVENT, refreshLeaderboardCache } from '../lib/refreshLeaderboard'
import { supabase } from '../lib/supabase'
import { optimizeAvatarUrl, normalizeAvatarUrl } from '../lib/userDisplay'

const RANKINGS_AVATAR_PX = 40
const PODIUM_AVATAR_PX = { gold: 72, silver: 58, bronze: 58 }

const PODIUM_LAYOUT = [
  { place: 2, medal: '🥈', modifier: 'silver' },
  { place: 1, medal: '🥇', modifier: 'gold' },
  { place: 3, medal: '🥉', modifier: 'bronze' },
]

const SORTABLE_COLUMNS = [
  { key: 'games', label: '경기' },
  { key: 'wins', label: '승' },
  { key: 'losses', label: '패' },
  { key: 'draws', label: '무' },
  { key: 'win_rate', label: '승률' },
]

/** 동률 시 2·3차 정렬 (방향: asc | desc) */
const SORT_TIE_BREAKERS = {
  wins: [
    ['losses', 'asc'],
    ['draws', 'asc'],
  ],
  losses: [
    ['wins', 'asc'],
    ['draws', 'asc'],
  ],
  draws: [
    ['wins', 'desc'],
    ['losses', 'asc'],
  ],
  win_rate: [
    ['wins', 'desc'],
    ['losses', 'asc'],
    ['draws', 'asc'],
  ],
}

const compareField = (a, b, field, direction) => {
  const diff = a[field] - b[field]
  if (diff === 0) return 0
  return direction === 'desc' ? -diff : diff
}

const compareRankedRows = (a, b, sortKey, sortDir) => {
  const primaryDir = sortDir === 'desc' ? 'desc' : 'asc'
  let result = compareField(a, b, sortKey, primaryDir)
  if (result !== 0) return result

  for (const [field, direction] of SORT_TIE_BREAKERS[sortKey] ?? []) {
    result = compareField(a, b, field, direction)
    if (result !== 0) return result
  }

  return String(a.display_name).localeCompare(String(b.display_name), 'ko')
}

const formatPodiumStat = (row, sortKey) => {
  switch (sortKey) {
    case 'games':
      return `${row.games}경기`
    case 'wins':
      return `${row.wins}승`
    case 'losses':
      return `${row.losses}패`
    case 'draws':
      return `${row.draws}무`
    case 'win_rate':
      return `${row.win_rate.toFixed(1)}%`
    default:
      return `${row.wins}승`
  }
}

function RankingsMemberName({
  displayName,
  targetUserId,
  currentUserId,
  isAdmin,
  onAdminDelete,
  deletingUserId,
  className = 'rankings-name',
}) {
  const name = displayName || '회원'
  const canDelete =
    isAdmin &&
    targetUserId &&
    currentUserId &&
    targetUserId !== currentUserId
  const isDeleting = deletingUserId === targetUserId

  if (!canDelete) {
    return <span className={className}>{name}</span>
  }

  return (
    <button
      type="button"
      className={`${className} rankings-name-admin-action`}
      disabled={Boolean(deletingUserId)}
      title="회원 삭제"
      onClick={() => onAdminDelete({ user_id: targetUserId, display_name: name })}
    >
      {isDeleting ? '삭제 중…' : name}
    </button>
  )
}

function RankingsUserCell({
  displayName,
  avatarUrl,
  targetUserId,
  currentUserId,
  isAdmin,
  onAdminDelete,
  deletingUserId,
}) {
  const [imgStage, setImgStage] = useState(0)
  const name = displayName || '회원'
  const initial = name.slice(0, 1)

  const avatarCandidates = useMemo(() => {
    const secured = normalizeAvatarUrl(avatarUrl)
    const dpr =
      typeof window !== 'undefined'
        ? Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
        : 2

    return [
      optimizeAvatarUrl(avatarUrl, RANKINGS_AVATAR_PX, {
        devicePixelRatio: dpr,
        minRequestPx: RANKINGS_AVATAR_PX,
      }),
      optimizeAvatarUrl(avatarUrl, RANKINGS_AVATAR_PX, {
        devicePixelRatio: 1,
        minRequestPx: RANKINGS_AVATAR_PX,
      }),
      secured,
    ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index)
  }, [avatarUrl])

  useEffect(() => {
    setImgStage(0)
  }, [avatarUrl])

  const avatarSrc = avatarCandidates[imgStage] ?? ''
  const showImage = Boolean(avatarSrc) && imgStage < avatarCandidates.length

  return (
    <span className="rankings-user-cell">
      {showImage ? (
        <span className="rankings-user-avatar-wrap">
          <img
            key={avatarSrc}
            className="rankings-user-avatar"
            src={avatarSrc}
            alt=""
            width={RANKINGS_AVATAR_PX}
            height={RANKINGS_AVATAR_PX}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgStage((prev) => prev + 1)}
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
      <RankingsMemberName
        displayName={name}
        targetUserId={targetUserId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onAdminDelete={onAdminDelete}
        deletingUserId={deletingUserId}
      />
    </span>
  )
}

function RankingsPodiumAvatar({
  displayName,
  avatarUrl,
  modifier,
  targetUserId,
  currentUserId,
  isAdmin,
  onAdminDelete,
  deletingUserId,
}) {
  const [imgStage, setImgStage] = useState(0)
  const name = displayName || '회원'
  const initial = name.slice(0, 1)
  const avatarPx = modifier === 'gold' ? PODIUM_AVATAR_PX.gold : PODIUM_AVATAR_PX.silver

  const avatarCandidates = useMemo(() => {
    const secured = normalizeAvatarUrl(avatarUrl)
    const dpr =
      typeof window !== 'undefined'
        ? Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
        : 2

    return [
      optimizeAvatarUrl(avatarUrl, avatarPx, {
        devicePixelRatio: dpr,
        minRequestPx: avatarPx,
      }),
      optimizeAvatarUrl(avatarUrl, avatarPx, {
        devicePixelRatio: 1,
        minRequestPx: avatarPx,
      }),
      secured,
    ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index)
  }, [avatarUrl, avatarPx])

  useEffect(() => {
    setImgStage(0)
  }, [avatarUrl, avatarPx])

  const avatarSrc = avatarCandidates[imgStage] ?? ''
  const showImage = Boolean(avatarSrc) && imgStage < avatarCandidates.length

  const handleImageError = () => {
    setImgStage((prev) => prev + 1)
  }

  return (
    <div className={`rankings-podium-avatar rankings-podium-avatar--${modifier}`}>
      {showImage ? (
        <img
          key={avatarSrc}
          className="rankings-podium-avatar-img"
          src={avatarSrc}
          alt=""
          width={avatarPx}
          height={avatarPx}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleImageError}
        />
      ) : (
        <span className="rankings-podium-avatar-fallback" aria-hidden="true">
          {initial}
        </span>
      )}
      <RankingsMemberName
        displayName={name}
        targetUserId={targetUserId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onAdminDelete={onAdminDelete}
        deletingUserId={deletingUserId}
        className="rankings-podium-avatar-name"
      />
    </div>
  )
}

function RankingsPodiumSlot({
  place,
  medal,
  modifier,
  row,
  userId,
  sortKey,
  isAdmin,
  onAdminDelete,
  deletingUserId,
}) {
  const isMe = Boolean(userId && row?.user_id === userId)

  return (
    <div
      className={[
        'rankings-podium-slot',
        `rankings-podium-slot--${modifier}`,
        row ? '' : 'rankings-podium-slot--empty',
        isMe ? 'rankings-podium-slot--me' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="rankings-podium-medal" aria-hidden="true">
        {medal}
      </div>
      {row ? (
        <>
          <RankingsPodiumAvatar
            displayName={row.display_name}
            avatarUrl={row.avatar_url}
            modifier={modifier}
            targetUserId={row.user_id}
            currentUserId={userId}
            isAdmin={isAdmin}
            onAdminDelete={onAdminDelete}
            deletingUserId={deletingUserId}
          />
          <p className="rankings-podium-stats">
            <span>{formatPodiumStat(row, sortKey)}</span>
          </p>
        </>
      ) : (
        <div className="rankings-podium-placeholder">
          <span className="rankings-podium-placeholder-avatar" aria-hidden="true">
            —
          </span>
          <span className="rankings-podium-placeholder-name">—</span>
        </div>
      )}
      <div className="rankings-podium-block" aria-label={`${place}위`}>
        {place}
      </div>
    </div>
  )
}

function RankingsPodium({
  topThree,
  userId,
  sortKey,
  isAdmin,
  onAdminDelete,
  deletingUserId,
}) {
  return (
    <div className="rankings-podium" aria-label="1위부터 3위까지 시상대">
      {PODIUM_LAYOUT.map(({ place, medal, modifier }) => (
        <RankingsPodiumSlot
          key={place}
          place={place}
          medal={medal}
          modifier={modifier}
          row={topThree[place - 1] ?? null}
          userId={userId}
          sortKey={sortKey}
          isAdmin={isAdmin}
          onAdminDelete={onAdminDelete}
          deletingUserId={deletingUserId}
        />
      ))}
    </div>
  )
}

function RankingsSortBar({ sortKey, sortDir, onSort }) {
  return (
    <div className="rankings-sort-bar" role="group" aria-label="정렬 기준">
      {SORTABLE_COLUMNS.map((column) => {
        const active = sortKey === column.key
        return (
          <button
            key={column.key}
            type="button"
            className={`rankings-sort-bar-button${active ? ' rankings-sort-bar-button--active' : ''}`}
            onClick={() => onSort(column.key)}
            aria-pressed={active}
          >
            {column.label}
            {active ? (
              <span className="rankings-sort-bar-icon" aria-hidden="true">
                {sortDir === 'desc' ? '▼' : '▲'}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function RankingsTableRow({
  row,
  userId,
  isAdmin,
  onAdminDelete,
  deletingUserId,
}) {
  const isMe = Boolean(userId && row.user_id === userId)
  return (
    <tr className={isMe ? 'rankings-row-me' : undefined}>
      <td>{row.rank}</td>
      <td>
        <RankingsUserCell
          displayName={row.display_name}
          avatarUrl={row.avatar_url}
          targetUserId={row.user_id}
          currentUserId={userId}
          isAdmin={isAdmin}
          onAdminDelete={onAdminDelete}
          deletingUserId={deletingUserId}
        />
      </td>
      <td>{row.games}</td>
      <td>{row.wins}</td>
      <td>{row.losses}</td>
      <td>{row.draws}</td>
      <td>{row.win_rate.toFixed(1)}%</td>
    </tr>
  )
}

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

function RankingsPage({ user }) {
  const userId = user?.id ?? null
  const isAdmin = isAdminUser(user)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adminError, setAdminError] = useState('')
  const [deletingUserId, setDeletingUserId] = useState(null)
  const [sortKey, setSortKey] = useState('wins')
  const [sortDir, setSortDir] = useState('desc')

  const loadLeaderboard = useCallback(async () => {
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
  }, [])
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      await loadLeaderboard()
    }

    void load()

    const onRefresh = () => {
      if (!cancelled) void loadLeaderboard()
    }
    window.addEventListener(LEADERBOARD_UPDATED_EVENT, onRefresh)
    window.addEventListener('focus', onRefresh)

    return () => {
      cancelled = true
      window.removeEventListener(LEADERBOARD_UPDATED_EVENT, onRefresh)
      window.removeEventListener('focus', onRefresh)
    }
  }, [loadLeaderboard])

  const handleAdminDelete = useCallback(
    async (row) => {
      if (!isAdmin || !supabase || !row?.user_id) return

      const name = row.display_name || '회원'
      const firstOk = window.confirm(
        `「${name}」 회원을 삭제하시겠습니까?\n\n직관 기록·프로필 등 모든 데이터가 영구 삭제되며 복구할 수 없습니다.`,
      )
      if (!firstOk) return

      const secondOk = window.confirm(
        `정말 「${name}」 회원을 삭제할까요?\n\n마지막 확인입니다. 되돌릴 수 없습니다.`,
      )
      if (!secondOk) return

      setAdminError('')
      setDeletingUserId(row.user_id)
      const { error: deleteError } = await supabase.rpc('admin_delete_member', {
        target_user_id: row.user_id,
      })
      setDeletingUserId(null)

      if (deleteError) {
        setAdminError(deleteError.message)
        return
      }

      setRows((prev) => prev.filter((item) => item.user_id !== row.user_id))
      void refreshLeaderboardCache(supabase)
    },
    [isAdmin],
  )

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

    prepared.sort((a, b) => compareRankedRows(a, b, sortKey, sortDir))

    return prepared.map((row, index) => ({
      ...row,
      rank: index + 1,
    }))
  }, [rows, sortKey, sortDir])

  const isDrawsSortWithNoDraws = useMemo(
    () =>
      sortKey === 'draws' &&
      rankedRows.length > 0 &&
      rankedRows.every((row) => row.draws === 0),
    [sortKey, rankedRows],
  )

  const showPodium = !isDrawsSortWithNoDraws && rankedRows.length > 0
  const podiumRows = useMemo(
    () => (isDrawsSortWithNoDraws ? [] : rankedRows.slice(0, 3)),
    [rankedRows, isDrawsSortWithNoDraws],
  )

  return (
    <section className="rankings-page">
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>승리기운 순위</h2>
        <p className="muted" style={{ textAlign: 'center' }}>
          수다방에서 누가 가장 승리요정일까요?
        </p>

        {loading ? <p>순위를 불러오는 중...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {adminError ? (
          <p className="error" role="alert">
            {adminError}
          </p>
        ) : null}
        {isAdmin ? (
          <p className="rankings-admin-hint muted" role="status">
            관리자: 닉네임을 누르면 해당 회원을 삭제할 수 있습니다.
          </p>
        ) : null}

        {!loading && !error && !rankedRows.length ? (
          <p className="muted">아직 직관 데이터가 있는 회원이 없습니다.</p>
        ) : null}

        {!loading && !error && rankedRows.length ? (
          <>
            <RankingsSortBar sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />

            {isDrawsSortWithNoDraws ? (
              <p className="rankings-no-draws-notice" role="status">
                아직 무승부 기록이 없습니다.
              </p>
            ) : null}

            {showPodium ? (
              <RankingsPodium
                topThree={podiumRows}
                userId={userId}
                sortKey={sortKey}
                isAdmin={isAdmin}
                onAdminDelete={handleAdminDelete}
                deletingUserId={deletingUserId}
              />
            ) : null}

            {rankedRows.length ? (
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
                    {rankedRows.map((row) => (
                      <RankingsTableRow
                        key={row.user_id}
                        row={row}
                        userId={userId}
                        isAdmin={isAdmin}
                        onAdminDelete={handleAdminDelete}
                        deletingUserId={deletingUserId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}

export default RankingsPage

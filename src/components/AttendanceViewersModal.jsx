import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { refreshLeaderboardCache } from '../lib/refreshLeaderboard'

const AVATAR_PX = 40
const SEARCH_DEBOUNCE_MS = 280

function MemberAvatar({ displayName, avatarUrl }) {
  const initial = (displayName || '?').trim().charAt(0) || '?'
  const avatarCandidates = useMemo(() => {
    const list = []
    if (avatarUrl) list.push(avatarUrl)
    return list
  }, [avatarUrl])
  const [imgStage, setImgStage] = useState(0)

  useEffect(() => {
    setImgStage(0)
  }, [avatarUrl])

  const avatarSrc = avatarCandidates[imgStage] ?? ''
  const showImage = Boolean(avatarSrc) && imgStage < avatarCandidates.length

  if (showImage) {
    return (
      <span className="attendance-viewer-avatar-wrap">
        <img
          key={avatarSrc}
          className="attendance-viewer-avatar"
          src={avatarSrc}
          alt=""
          width={AVATAR_PX}
          height={AVATAR_PX}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgStage((prev) => prev + 1)}
        />
      </span>
    )
  }

  return (
    <span className="attendance-viewer-avatar attendance-viewer-avatar-fallback" aria-hidden>
      {initial}
    </span>
  )
}

function formatModalDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${weekdays[d.getDay()]})`
}

function AttendanceViewersModal({ dateText, match, onClose }) {
  const [viewers, setViewers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [actingUserId, setActingUserId] = useState(null)
  const [actionMessage, setActionMessage] = useState('')

  const viewerIds = useMemo(() => new Set(viewers.map((row) => row.user_id)), [viewers])

  const loadViewers = useCallback(async () => {
    if (!supabase || !dateText) return
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.rpc('admin_list_attendance_by_date', {
      p_date: dateText,
    })
    if (loadError) {
      setError(loadError.message)
      setViewers([])
    } else {
      setViewers(data ?? [])
    }
    setLoading(false)
  }, [dateText])

  useEffect(() => {
    void loadViewers()
  }, [loadViewers])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!supabase) return undefined
    const q = searchQuery.trim()
    if (q.length < 1) {
      setSearchResults([])
      setSearchLoading(false)
      return undefined
    }

    setSearchLoading(true)
    const timer = window.setTimeout(async () => {
      const { data, error: searchError } = await supabase.rpc(
        'admin_search_members_for_attendance',
        {
          search_query: q,
          result_limit: 20,
        },
      )
      if (searchError) {
        setActionMessage(searchError.message)
        setSearchResults([])
      } else {
        setSearchResults(data ?? [])
        setActionMessage('')
      }
      setSearchLoading(false)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const addMember = async (targetUserId) => {
    if (!supabase || actingUserId) return
    setActingUserId(targetUserId)
    setActionMessage('')
    const { error: addError } = await supabase.rpc('admin_add_member_attendance', {
      target_user_id: targetUserId,
      attendance_date: dateText,
    })
    if (addError) {
      setActionMessage(addError.message)
    } else {
      setSearchQuery('')
      setSearchResults([])
      await loadViewers()
      void refreshLeaderboardCache(supabase)
    }
    setActingUserId(null)
  }

  const opponentLabel = match?.opponent_team ? ` vs ${match.opponent_team}` : ''

  return (
    <div className="attendance-viewers-backdrop" role="presentation" onClick={onClose}>
      <div
        className="attendance-viewers-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-viewers-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="attendance-viewers-header">
          <div>
            <h3 id="attendance-viewers-title">직관러 확인</h3>
            <p className="attendance-viewers-subtitle">
              {formatModalDate(dateText)}
              {opponentLabel}
            </p>
          </div>
          <button
            type="button"
            className="attendance-viewers-close"
            aria-label="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <section className="attendance-viewers-search" aria-label="회원 검색 및 추가">
          <label className="attendance-viewers-search-label" htmlFor="attendance-viewer-member-search">
            회원 추가
          </label>
          <input
            id="attendance-viewer-member-search"
            type="search"
            className="attendance-viewers-search-input"
            placeholder="회원 이름 검색"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            autoComplete="off"
          />
          {searchLoading ? <p className="muted attendance-viewers-search-hint">검색 중…</p> : null}
          {!searchLoading && searchQuery.trim() && searchResults.length === 0 ? (
            <p className="muted attendance-viewers-search-hint">검색 결과가 없습니다.</p>
          ) : null}
          {searchResults.length ? (
            <ul className="attendance-viewers-search-results">
              {searchResults.map((member) => {
                const alreadyAdded = viewerIds.has(member.user_id)
                return (
                  <li key={member.user_id}>
                    <div className="attendance-viewer-row">
                      <MemberAvatar
                        displayName={member.display_name}
                        avatarUrl={member.avatar_url}
                      />
                      <div className="attendance-viewer-meta">
                        <span className="attendance-viewer-name">{member.display_name}</span>
                        {member.email ? (
                          <span className="attendance-viewer-email">{member.email}</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="attendance-viewer-add-button"
                        disabled={alreadyAdded || actingUserId === member.user_id}
                        onClick={() => void addMember(member.user_id)}
                      >
                        {alreadyAdded ? '추가됨' : actingUserId === member.user_id ? '추가 중…' : '추가'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </section>

        <section className="attendance-viewers-list-section" aria-label="직관 회원 목록">
          <h4 className="attendance-viewers-list-heading">
            직관 회원 <span className="attendance-viewers-count">{viewers.length}</span>명
          </h4>
          {loading ? <p className="muted">불러오는 중…</p> : null}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && !error && viewers.length === 0 ? (
            <p className="muted">이 날짜에 등록된 직관 회원이 없습니다.</p>
          ) : null}
          {!loading && !error && viewers.length > 0 ? (
            <ul className="attendance-viewers-list">
              {viewers.map((row) => (
                <li key={row.user_id}>
                  <div className="attendance-viewer-row attendance-viewer-row--static">
                    <MemberAvatar displayName={row.display_name} avatarUrl={row.avatar_url} />
                    <div className="attendance-viewer-meta">
                      <span className="attendance-viewer-name">{row.display_name}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {actionMessage ? (
          <p className="error attendance-viewers-action-message" role="alert">
            {actionMessage}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default AttendanceViewersModal
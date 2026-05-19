import { useCallback, useEffect, useMemo, useState } from 'react'
import { refreshLeaderboardCache } from '../lib/refreshLeaderboard'
import { normalizeAvatarUrl, optimizeAvatarUrl } from '../lib/userDisplay'
import { supabase } from '../lib/supabase'

const ADMIN_AVATAR_PX = 32

function formatMemberDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ko-KR')
}

function AdminMemberAvatar({ displayName, avatarUrl }) {
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
      optimizeAvatarUrl(avatarUrl, ADMIN_AVATAR_PX, {
        devicePixelRatio: dpr,
        minRequestPx: 64,
      }),
      optimizeAvatarUrl(avatarUrl, ADMIN_AVATAR_PX, {
        devicePixelRatio: 1,
        minRequestPx: 64,
      }),
      secured,
    ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index)
  }, [avatarUrl])

  useEffect(() => {
    setImgStage(0)
  }, [avatarUrl])

  const avatarSrc = avatarCandidates[imgStage] ?? ''
  const showImage = Boolean(avatarSrc) && imgStage < avatarCandidates.length

  if (showImage) {
    return (
      <span className="admin-member-avatar-wrap">
        <img
          key={avatarSrc}
          className="admin-member-avatar"
          src={avatarSrc}
          alt=""
          width={ADMIN_AVATAR_PX}
          height={ADMIN_AVATAR_PX}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgStage((prev) => prev + 1)}
        />
      </span>
    )
  }

  return (
    <span className="admin-member-avatar admin-member-avatar-fallback" aria-hidden>
      {initial}
    </span>
  )
}

function AdminMembersCard({ currentUserId }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState(null)
  const [actionError, setActionError] = useState('')

  const loadMembers = useCallback(async () => {
    if (!supabase) {
      setError('Supabase에 연결되어 있지 않습니다.')
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase.rpc('admin_list_members')
    if (loadError) {
      setError(loadError.message)
      setMembers([])
    } else {
      setMembers(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const updateMemberBlocked = (userId, isBlocked) => {
    setMembers((prev) =>
      prev.map((row) =>
        row.user_id === userId ? { ...row, is_blocked: isBlocked } : row,
      ),
    )
  }

  const handleDeleteMember = async (member) => {
    const label = member.display_name || '회원'
    const email = member.email ? `\n(${member.email})` : ''
    const firstOk = window.confirm(
      `${label}${email} 회원을 삭제하시겠습니까?\n\n프로필·직관 기록 등 모든 데이터가 영구 삭제됩니다.`,
    )
    if (!firstOk) return

    const secondOk = window.confirm(
      `정말 ${label} 회원을 삭제할까요?\n\n되돌릴 수 없습니다.`,
    )
    if (!secondOk) return

    if (!supabase) return

    setActingId(member.user_id)
    setActionError('')
    const { error: deleteError } = await supabase.rpc('admin_delete_member', {
      target_user_id: member.user_id,
    })
    setActingId(null)

    if (deleteError) {
      setActionError(deleteError.message)
      return
    }

    setMembers((prev) => prev.filter((row) => row.user_id !== member.user_id))
    void refreshLeaderboardCache(supabase)
  }

  const handleBlockMember = async (member) => {
    const label = member.display_name || '회원'
    const ok = window.confirm(
      `${label} 회원을 차단하시겠습니까?\n\n순위에서 숨겨지며 로그인·접속이 불가능해집니다.`,
    )
    if (!ok || !supabase) return

    setActingId(member.user_id)
    setActionError('')
    const { error: blockError } = await supabase.rpc('admin_block_member', {
      target_user_id: member.user_id,
    })
    setActingId(null)

    if (blockError) {
      setActionError(blockError.message)
      return
    }

    updateMemberBlocked(member.user_id, true)
    void refreshLeaderboardCache(supabase)
  }

  const handleUnblockMember = async (member) => {
    const label = member.display_name || '회원'
    const ok = window.confirm(`${label} 회원의 차단을 해제하시겠습니까?`)
    if (!ok || !supabase) return

    setActingId(member.user_id)
    setActionError('')
    const { error: unblockError } = await supabase.rpc('admin_unblock_member', {
      target_user_id: member.user_id,
    })
    setActingId(null)

    if (unblockError) {
      setActionError(unblockError.message)
      return
    }

    updateMemberBlocked(member.user_id, false)
    void refreshLeaderboardCache(supabase)
  }

  return (
    <section className="card admin-members-card">
      <div className="admin-members-header">
        <div>
          <h2>회원 관리</h2>
          <p className="muted admin-members-desc">
            관리자 전용 · 차단 시 순위 제외 및 접속 불가 · 삭제 시 모든 데이터가 제거됩니다.
          </p>
        </div>
        <button
          type="button"
          className="admin-members-refresh"
          onClick={() => void loadMembers()}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      {loading ? <p className="muted admin-members-status">불러오는 중…</p> : null}
      {error ? (
        <p className="error admin-members-status" role="alert">
          {error}
        </p>
      ) : null}
      {actionError ? (
        <p className="error admin-members-status" role="alert">
          {actionError}
        </p>
      ) : null}

      {!loading && !error ? (
        <div className="admin-members-table-wrap">
          <table className="admin-members-table">
            <thead>
              <tr>
                <th scope="col">회원</th>
                <th scope="col">이메일</th>
                <th scope="col">직관</th>
                <th scope="col">상태</th>
                <th scope="col">가입일</th>
                <th scope="col">관리</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-members-empty">
                    등록된 회원이 없습니다.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const isSelf = member.user_id === currentUserId
                  const isBlocked = Boolean(member.is_blocked)
                  const isActing = actingId === member.user_id
                  const rowClass = isBlocked ? 'admin-members-row--blocked' : ''

                  return (
                    <tr key={member.user_id} className={rowClass}>
                      <td>
                        <span className="admin-member-name-cell">
                          <AdminMemberAvatar
                            displayName={member.display_name}
                            avatarUrl={member.avatar_url}
                          />
                          <span className="admin-member-name">{member.display_name}</span>
                          {isSelf ? (
                            <span className="admin-member-badge">나</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="admin-member-email">{member.email || '—'}</td>
                      <td className="admin-member-count">{member.attendance_count ?? 0}경기</td>
                      <td>
                        <span
                          className={
                            isBlocked
                              ? 'admin-member-status-badge admin-member-status-badge--blocked'
                              : 'admin-member-status-badge admin-member-status-badge--active'
                          }
                        >
                          {isBlocked ? '차단' : '정상'}
                        </span>
                      </td>
                      <td>{formatMemberDate(member.created_at)}</td>
                      <td>
                        {isSelf ? (
                          <span className="muted admin-member-self-hint">본인</span>
                        ) : (
                          <div className="admin-member-actions">
                            {isBlocked ? (
                              <button
                                type="button"
                                className="admin-member-unblock-button"
                                disabled={Boolean(actingId)}
                                onClick={() => void handleUnblockMember(member)}
                              >
                                {isActing ? '처리 중…' : '차단해제'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="admin-member-block-button"
                                disabled={Boolean(actingId)}
                                onClick={() => void handleBlockMember(member)}
                              >
                                {isActing ? '처리 중…' : '차단'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-member-delete-button"
                              disabled={Boolean(actingId)}
                              onClick={() => void handleDeleteMember(member)}
                            >
                              {isActing ? '처리 중…' : '삭제'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

export default AdminMembersCard

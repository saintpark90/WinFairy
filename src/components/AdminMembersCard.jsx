import { useCallback, useEffect, useState } from 'react'
import { refreshLeaderboardCache } from '../lib/refreshLeaderboard'
import { optimizeAvatarUrl } from '../lib/userDisplay'
import { supabase } from '../lib/supabase'

const ADMIN_AVATAR_PX = 32

function formatMemberDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ko-KR')
}

function AdminMemberAvatar({ displayName, avatarUrl }) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = optimizeAvatarUrl(avatarUrl, ADMIN_AVATAR_PX, {
    minRequestPx: ADMIN_AVATAR_PX,
  })
  const initial = (displayName || '회원').slice(0, 1)

  useEffect(() => {
    setImgFailed(false)
  }, [avatarUrl])

  if (src && !imgFailed) {
    return (
      <img
        className="admin-member-avatar"
        src={src}
        alt=""
        width={ADMIN_AVATAR_PX}
        height={ADMIN_AVATAR_PX}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
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
  const [deletingId, setDeletingId] = useState(null)
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

    setDeletingId(member.user_id)
    setActionError('')
    const { error: deleteError } = await supabase.rpc('admin_delete_member', {
      target_user_id: member.user_id,
    })
    setDeletingId(null)

    if (deleteError) {
      setActionError(deleteError.message)
      return
    }

    setMembers((prev) => prev.filter((row) => row.user_id !== member.user_id))
    void refreshLeaderboardCache(supabase)
  }

  return (
    <section className="card admin-members-card">
      <div className="admin-members-header">
        <div>
          <h2>회원 관리</h2>
          <p className="muted admin-members-desc">
            관리자 전용 · 회원 삭제 시 프로필과 직관 기록이 모두 제거됩니다.
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
                <th scope="col">가입일</th>
                <th scope="col">관리</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-members-empty">
                    등록된 회원이 없습니다.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const isSelf = member.user_id === currentUserId
                  const isDeleting = deletingId === member.user_id
                  return (
                    <tr key={member.user_id}>
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
                      <td>{formatMemberDate(member.created_at)}</td>
                      <td>
                        {isSelf ? (
                          <span className="muted admin-member-self-hint">본인</span>
                        ) : (
                          <button
                            type="button"
                            className="admin-member-delete-button"
                            disabled={Boolean(deletingId)}
                            onClick={() => void handleDeleteMember(member)}
                          >
                            {isDeleting ? '삭제 중…' : '삭제'}
                          </button>
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

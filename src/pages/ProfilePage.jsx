import { useEffect, useState } from 'react'
import AdminMembersCard from '../components/AdminMembersCard'
import { canAccessMemberAdmin, isSuperAdminUser } from '../lib/admin'
import {
  getUserDisplayFields,
  normalizeAvatarUrl,
  optimizeAvatarUrl,
  resolveAvatarUrl,
} from '../lib/userDisplay'
import { supabase } from '../lib/supabase'

const PROFILE_AVATAR_PX = 88

function ProfilePage({ user, onSignOut, onAccountDeleted }) {
  const { displayName: sessionDisplayName } = getUserDisplayFields(user)
  const [profileRow, setProfileRow] = useState(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [useRawAvatar, setUseRawAvatar] = useState(false)

  useEffect(() => {
    setImgFailed(false)
    setUseRawAvatar(false)
  }, [user?.id, profileRow?.avatar_url])

  useEffect(() => {
    if (!user?.id || !supabase) return undefined
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, is_admin')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled && !error && data) {
        setProfileRow(data)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const displayName =
    profileRow?.display_name?.trim() || sessionDisplayName
  const avatarUrl = resolveAvatarUrl(user, profileRow)
  const profileAvatarSrc = useRawAvatar
    ? normalizeAvatarUrl(avatarUrl)
    : optimizeAvatarUrl(avatarUrl, PROFILE_AVATAR_PX, {
        minRequestPx: PROFILE_AVATAR_PX,
      })
  const showAvatar = Boolean(profileAvatarSrc) && !imgFailed
  const email = user?.email ?? ''
  const isSuperAdmin = isSuperAdminUser(user)
  const isAdmin = canAccessMemberAdmin(user, profileRow)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleDeleteAccount = async () => {
    const firstOk = window.confirm(
      '계정을 삭제하시겠습니까?\n\n직관 기록·프로필 등 내 모든 데이터가 영구 삭제되며 복구할 수 없습니다.',
    )
    if (!firstOk) return

    const secondOk = window.confirm(
      '정말 삭제할까요?\n\n마지막 확인입니다. 확인을 누르면 즉시 삭제되며 되돌릴 수 없습니다.',
    )
    if (!secondOk) return

    if (!supabase) {
      window.alert('데이터베이스에 연결되어 있지 않아 계정을 삭제할 수 없습니다.')
      return
    }

    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.rpc('delete_own_account')
    setDeleting(false)

    if (error) {
      setDeleteError(error.message)
      return
    }

    if (onAccountDeleted) {
      await onAccountDeleted()
    }
  }

  return (
    <div className="dashboard">
      <section className="card profile-card">
        <h2>내 정보</h2>
        <div className="profile-layout">
          {showAvatar ? (
            <span className="profile-avatar-wrap">
              <img
                className="profile-avatar-large"
                src={profileAvatarSrc}
                alt=""
                width={PROFILE_AVATAR_PX}
                height={PROFILE_AVATAR_PX}
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => {
                  if (!useRawAvatar && avatarUrl) {
                    setUseRawAvatar(true)
                    return
                  }
                  setImgFailed(true)
                }}
              />
            </span>
          ) : (
            <span className="user-avatar user-avatar-fallback profile-avatar-large" aria-hidden>
              {displayName.slice(0, 1)}
            </span>
          )}
          <div className="profile-details">
            <p className="profile-name">{displayName}</p>
            <p className="profile-welcome">승리요정 {displayName}님, 어서오세요!</p>
            {email ? (
              <p className="muted profile-email">
                <span className="profile-email-label">이메일</span> {email}
              </p>
            ) : null}
          </div>
        </div>

        <div className="profile-logout-section">
          <button type="button" className="profile-logout-button" onClick={onSignOut}>
            로그아웃
          </button>
        </div>

        <div className="profile-delete-section">
          <p className="profile-delete-hint muted">
            ※ 계정을 삭제하면 복구가 불가능합니다.
          </p>
          <button
            type="button"
            className="profile-delete-account-button"
            disabled={deleting}
            onClick={handleDeleteAccount}
          >
            {deleting ? '삭제 중…' : '계정 삭제'}
          </button>
          {deleteError ? (
            <p className="error profile-delete-error" role="alert">
              {deleteError}
            </p>
          ) : null}
        </div>
      </section>

      {isAdmin ? (
        <AdminMembersCard currentUserId={user?.id} isSuperAdmin={isSuperAdmin} />
      ) : null}
    </div>
  )
}

export default ProfilePage

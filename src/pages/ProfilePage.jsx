import { getUserDisplayFields } from '../lib/userDisplay'

function ProfilePage({ user }) {
  const { displayName, avatarUrl } = getUserDisplayFields(user)
  const email = user?.email ?? ''

  return (
    <div className="dashboard">
      <section className="card profile-card">
        <h2>내 정보</h2>
        <div className="profile-layout">
          {avatarUrl ? (
            <img
              className="profile-avatar-large"
              src={avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
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
      </section>
    </div>
  )
}

export default ProfilePage

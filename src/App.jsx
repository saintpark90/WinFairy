import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase, supabaseConfigError } from './lib/supabase'
import HomePage from './pages/HomePage'
import AttendancePage from './pages/AttendancePage'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    const initAuth = async () => {
      if (!supabase) {
        setAuthLoading(false)
        return
      }
      const { data } = await supabase.auth.getSession()
      const currentSession = data?.session ?? null
      setSession(currentSession)
      setAuthLoading(false)
    }

    initAuth()

    if (!supabase) {
      return undefined
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
      },
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const navClassName = useMemo(
    () => ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link'),
    [],
  )
  const signInWithKakao = async () => {
    if (!supabase) return
    setAuthError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: window.location.href,
      },
    })
    if (error) {
      setAuthError(error.message)
    }
  }

  if (authLoading) {
    return (
      <div className="app-shell">
        <p className="center-text">로그인 상태를 확인하는 중입니다...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app-shell">
        <div className="center-text">
          <p>카카오톡 로그인 후 전체 기능을 사용할 수 있습니다.</p>
          {supabaseConfigError ? (
            <p className="error">{supabaseConfigError}</p>
          ) : null}
          {authError ? <p className="error">{authError}</p> : null}
          <button type="button" onClick={signInWithKakao}>
            카카오톡으로 로그인
          </button>
        </div>
      </div>
    )
  }

  const displayName =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.user_metadata?.nickname ||
    session.user.user_metadata?.preferred_username ||
    session.user.email?.split('@')[0] ||
    '회원'
  const avatarUrl =
    session.user.user_metadata?.avatar_url ||
    session.user.user_metadata?.picture ||
    ''

  return (
    <div className="app-shell">
      <header className="top-nav">
        <h1 className="logo">승요 이글스</h1>
        <div className="top-nav-right">
          <div className="user-greeting">
            {avatarUrl ? (
              <img
                className="user-avatar"
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="user-avatar user-avatar-fallback" aria-hidden>
                {displayName.slice(0, 1)}
              </span>
            )}
            <div className="user-greeting-text">
              <span className="user-name">{displayName}</span>
              <span className="user-welcome">
                승리요정 {displayName}님, 어서오세요!
              </span>
            </div>
          </div>
          <nav>
            <NavLink to="/" className={navClassName}>
              홈
            </NavLink>
            <NavLink to="/attendance" className={navClassName}>
              직관일 입력
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage userId={session.user.id} />} />
          <Route
            path="/attendance"
            element={<AttendancePage userId={session.user.id} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

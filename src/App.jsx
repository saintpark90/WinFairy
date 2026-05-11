import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase, supabaseConfigError } from './lib/supabase'
import { getUserDisplayFields, isAuthUserUuid } from './lib/userDisplay'
import HomePage from './pages/HomePage'
import AttendancePage from './pages/AttendancePage'
import RankingsPage from './pages/RankingsPage'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const isLocalDevHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  const localSessionStorageKey = 'winfairy-local-session'
  const useLocalMockAuth = isLocalDevHost && !supabase

  useEffect(() => {
    const initAuth = async () => {
      if (useLocalMockAuth) {
        const storedSession = window.localStorage.getItem(localSessionStorageKey)
        if (storedSession) {
          try {
            setSession(JSON.parse(storedSession))
          } catch {
            window.localStorage.removeItem(localSessionStorageKey)
          }
        }
        setAuthLoading(false)
        return
      }

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

    if (useLocalMockAuth || !supabase) {
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
  }, [useLocalMockAuth])

  useEffect(() => {
    if (!session?.user || useLocalMockAuth || !supabase) return
    if (!isAuthUserUuid(session.user.id)) return

    const { displayName, avatarUrl } = getUserDisplayFields(session.user)

    let cancelled = false
    ;(async () => {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          display_name: displayName,
          avatar_url: avatarUrl || null,
          email: session.user.email ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (!cancelled && error) {
        console.error('[profiles]', error.message)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session, useLocalMockAuth])

  const navClassName = useMemo(
    () => ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link'),
    [],
  )
  const signInWithKakao = async () => {
    if (useLocalMockAuth) {
      const mockSession = {
        user: {
          id: 'local-kakao-user',
          email: 'local-kakao@example.com',
          user_metadata: {
            nickname: '로컬테스트',
          },
        },
      }
      window.localStorage.setItem(localSessionStorageKey, JSON.stringify(mockSession))
      setSession(mockSession)
      setAuthError('')
      return
    }

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
      <div className="app-shell login-shell">
        <div className="login-screen">
          <div className="login-card">
            <h1 className="login-title">승리요정</h1>
            <p className="login-description">로그인은 카카오톡으로만 가능합니다.</p>
            {supabaseConfigError && !useLocalMockAuth ? (
              <p className="error">{supabaseConfigError}</p>
            ) : null}
            {authError ? <p className="error">{authError}</p> : null}
            <button type="button" className="kakao-login-button" onClick={signInWithKakao}>
              <span className="kakao-icon" aria-hidden>
                <svg viewBox="0 0 24 24" role="img" focusable="false">
                  <circle cx="12" cy="12" r="12" fill="currentColor" />
                  <path
                    d="M6.7 8.8c0-2.1 2.4-3.8 5.3-3.8s5.3 1.7 5.3 3.8-2.4 3.8-5.3 3.8h-.4l-2.2 1.7.5-1.9c-1.9-.6-3.2-2-3.2-3.6Z"
                    fill="#3c1e1e"
                  />
                </svg>
              </span>
              <span>카카오톡으로 로그인</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { displayName, avatarUrl } = getUserDisplayFields(session.user)

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
          <nav className="main-nav-links">
            <NavLink end to="/" className={navClassName}>
              내 정보
            </NavLink>
            <NavLink to="/rankings" className={navClassName}>
              순위
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
          <Route path="/rankings" element={<RankingsPage userId={session.user.id} />} />
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

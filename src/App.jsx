import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase, supabaseConfigError } from './lib/supabase'
import { BLOCKED_LOGIN_MESSAGE } from './lib/admin'
import { refreshLeaderboardCache } from './lib/refreshLeaderboard'
import { getUserDisplayFields, isAuthUserUuid } from './lib/userDisplay'
import { resetLoginScroll, useLoginViewportLock } from './lib/useLoginViewportLock'
import AppTail from './components/AppTail'
import ThemeToggle from './components/ThemeToggle'
import HomePage from './pages/HomePage'
import AttendancePage from './pages/AttendancePage'
import RankingsPage from './pages/RankingsPage'
import TeamStatsPage from './pages/TeamStatsPage'
import ProfilePage from './pages/ProfilePage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'

const PARTICIPATION_CODE = '0245'

function LoginScreen({
  participationCode,
  setParticipationCode,
  participationCodeError,
  setParticipationCodeError,
  useLocalMockAuth,
  authError,
  onSubmit,
}) {
  useLoginViewportLock(true)

  return (
    <div className="app-shell login-shell">
      <div className="login-screen">
        <div className="login-theme-toggle-wrap">
          <ThemeToggle />
        </div>
        <div className="login-card">
          <h1 className="login-title do-hyeon-regular">승리요정</h1>
          <p className="login-tagline">당신의 승리기운을 위하여</p>
          <p className="login-description" />
          <form
            className="login-form"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
            }}
          >
            <div className="login-participation-wrap">
              <input
                id="login-participation-code"
                className="login-participation-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="참여코드를 입력하세요"
                value={participationCode}
                onChange={(e) => {
                  setParticipationCode(e.target.value)
                  setParticipationCodeError('')
                }}
                onFocus={resetLoginScroll}
              />
            </div>
            {participationCodeError ? (
              <p className="error login-participation-error" role="alert">
                {participationCodeError}
              </p>
            ) : (
              <>
                {supabaseConfigError && !useLocalMockAuth ? (
                  <p className="error">{supabaseConfigError}</p>
                ) : null}
                {authError ? <p className="error">{authError}</p> : null}
              </>
            )}
            <button type="submit" className="kakao-login-button">
              <span className="kakao-icon" aria-hidden>
                <svg viewBox="0 0 24 22" role="img" focusable="false" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fill="currentColor"
                    d="M12 1C5.65 1 .5 5.05.5 10.1c0 2.75 1.42 5.2 3.65 6.85L3 21l5.15-3.4c1.15.25 2.35.4 3.85.4 6.35 0 11.5-4.05 11.5-9.1S18.35 1 12 1Z"
                  />
                </svg>
              </span>
              <span className="kakao-login-button-label">카카오톡으로 로그인</span>
            </button>
          </form>
        </div>
        <AppTail className="login-tail" />
      </div>
    </div>
  )
}

function AuthenticatedApp({ session, userDisplayName, navClassName, signOut }) {
  return (
    <div className="app-shell">
      <header className="app-top-bar">
        <div className="app-top-bar-brand">
          <h1 className="logo do-hyeon-regular">승리요정</h1>
        </div>
        <nav className="app-main-nav" aria-label="메인 메뉴">
          <NavLink end to="/" className={navClassName}>
            메인화면
          </NavLink>
          <NavLink to="/rankings" className={navClassName}>
            순위
          </NavLink>
          <NavLink to="/team-stats" className={navClassName}>
            팀성적
          </NavLink>
          <NavLink to="/attendance" className={navClassName}>
            직관일 입력
          </NavLink>
          <NavLink to="/profile" className={navClassName}>
            내 정보
          </NavLink>
          <ThemeToggle />
        </nav>
      </header>
      <main className="content">
        <Routes>
          <Route
            path="/"
            element={<HomePage userId={session.user.id} userDisplayName={userDisplayName} />}
          />
          <Route path="/rankings" element={<RankingsPage userId={session.user.id} />} />
          <Route path="/team-stats" element={<TeamStatsPage userId={session.user.id} />} />
          <Route path="/attendance" element={<AttendancePage userId={session.user.id} />} />
          <Route
            path="/profile"
            element={
              <ProfilePage
                user={session.user}
                onSignOut={signOut}
                onAccountDeleted={signOut}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <AppTail />
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [sessionReady, setSessionReady] = useState(true)
  const [authError, setAuthError] = useState('')
  const [participationCode, setParticipationCode] = useState('')
  const [participationCodeError, setParticipationCodeError] = useState('')

  const userDisplayName = session?.user?.user_metadata?.name
    || session?.user?.user_metadata?.nickname
    || session?.user?.user_metadata?.full_name
    || session?.user?.email?.split('@')[0]
    || '사용자'
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
    const securedAvatar = avatarUrl || null

    let cancelled = false
    ;(async () => {
      const { error } = await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          display_name: displayName,
          avatar_url: securedAvatar,
          email: session.user.email ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      if (!cancelled && error) {
        console.error('[profiles]', error.message)
      } else if (!cancelled && !error) {
        void refreshLeaderboardCache(supabase)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session, useLocalMockAuth])

  useEffect(() => {
    if (!session?.user?.id || useLocalMockAuth || !supabase) {
      setSessionReady(true)
      return undefined
    }
    if (!isAuthUserUuid(session.user.id)) {
      setSessionReady(true)
      return undefined
    }

    let cancelled = false
    setSessionReady(false)
    ;(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_blocked')
        .eq('id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (!error && data?.is_blocked) {
        await supabase.auth.signOut()
        setSession(null)
        setAuthError(BLOCKED_LOGIN_MESSAGE)
        setSessionReady(true)
        return
      }

      setSessionReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [session?.user?.id, useLocalMockAuth])

  const navClassName = useMemo(
    () => ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link'),
    [],
  )

  const signInWithKakao = async () => {
    const trimmed = participationCode.trim()
    if (trimmed !== PARTICIPATION_CODE) {
      setParticipationCodeError('참여코드가 올바르지 않습니다.')
      setAuthError('')
      return
    }
    setParticipationCodeError('')

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

  const signOut = async () => {
    if (useLocalMockAuth) {
      window.localStorage.removeItem(localSessionStorageKey)
      setSession(null)
      return
    }
    if (supabase) {
      await supabase.auth.signOut()
    }
    setSession(null)
  }

  if (authLoading || (session && !sessionReady)) {
    return (
      <div className="app-shell">
        <p className="center-text">로그인 상태를 확인하는 중입니다...</p>
        <AppTail />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      {!session ? (
        <Route
          path="*"
          element={
            <LoginScreen
              participationCode={participationCode}
              setParticipationCode={setParticipationCode}
              participationCodeError={participationCodeError}
              setParticipationCodeError={setParticipationCodeError}
              useLocalMockAuth={useLocalMockAuth}
              authError={authError}
              onSubmit={signInWithKakao}
            />
          }
        />
      ) : (
        <Route
          path="*"
          element={
            <AuthenticatedApp
              session={session}
              userDisplayName={userDisplayName}
              navClassName={navClassName}
              signOut={signOut}
            />
          }
        />
      )}
    </Routes>
  )
}

export default App

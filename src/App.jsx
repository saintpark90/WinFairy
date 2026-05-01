import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  supabase,
  supabaseAnonKey,
  supabaseConfigError,
  supabaseUrl,
} from './lib/supabase'
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
  const dbConnectionInfo = useMemo(() => {
    const maskedAnonKey =
      supabaseAnonKey && supabaseAnonKey.length > 12
        ? `${supabaseAnonKey.slice(0, 8)}...${supabaseAnonKey.slice(-4)}`
        : supabaseAnonKey || '-'
    const projectRef = supabaseUrl?.split('://')[1]?.split('.')[0] ?? '-'
    return [
      { label: 'Supabase URL', value: supabaseUrl ?? '-' },
      { label: 'Project Ref', value: projectRef },
      { label: 'Anon Key', value: maskedAnonKey },
      { label: 'Schema', value: 'public (matches, user_attendance)' },
      {
        label: 'Config Status',
        value: supabaseConfigError || 'OK',
      },
    ]
  }, [])

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
        <section className="card">
          <h3>DB 접속정보</h3>
          <ul className="ranking">
            {dbConnectionInfo.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </section>
        <p className="center-text">로그인 상태를 확인하는 중입니다...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="app-shell">
        <section className="card">
          <h3>DB 접속정보</h3>
          <ul className="ranking">
            {dbConnectionInfo.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </section>
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

  return (
    <div className="app-shell">
      <header className="top-nav">
        <h1 className="logo">승요 이글스</h1>
        <nav>
          <NavLink to="/" className={navClassName}>
            홈
          </NavLink>
          <NavLink to="/attendance" className={navClassName}>
            직관일 입력
          </NavLink>
        </nav>
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

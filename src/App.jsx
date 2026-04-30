import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './lib/supabase'
import HomePage from './pages/HomePage'
import AttendancePage from './pages/AttendancePage'

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      const { data } = await supabase.auth.getSession()
      const currentSession = data?.session ?? null
      setSession(currentSession)
      setAuthLoading(false)
      if (!currentSession) {
        await supabase.auth.signInWithOAuth({
          provider: 'kakao',
          options: {
            redirectTo: window.location.href,
          },
        })
      }
    }

    initAuth()

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

  if (authLoading) {
    return <p className="center-text">로그인 상태를 확인하는 중입니다...</p>
  }

  if (!session) {
    return <p className="center-text">카카오 로그인으로 이동합니다...</p>
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

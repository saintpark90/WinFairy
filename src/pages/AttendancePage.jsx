import { useState } from 'react'
import { supabase } from '../lib/supabase'

function AttendancePage({ userId }) {
  const [date, setDate] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    setIsError(false)

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, game_date, opponent_team, stadium, winner_team')
      .eq('game_date', date)
      .maybeSingle()

    if (matchError || !match) {
      setIsError(true)
      setMessage('해당 날짜의 한화 경기 정보가 없습니다. 먼저 경기 데이터를 적재해 주세요.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('user_attendance').upsert(
      {
        user_id: userId,
        match_id: match.id,
        attended_at: date,
      },
      { onConflict: 'user_id,match_id' },
    )

    if (insertError) {
      setIsError(true)
      setMessage(insertError.message)
      setLoading(false)
      return
    }

    setMessage(
      `${match.game_date} ${match.opponent_team}전 (${match.stadium}) 직관일이 저장되었습니다.`,
    )
    setDate('')
    setLoading(false)
  }

  return (
    <section className="card form-card">
      <h2>직관일 입력</h2>
      <p>
        날짜만 고르면 경기 정보는 `matches` 테이블에서 자동으로 찾아 연결합니다.
      </p>
      <form onSubmit={handleSubmit} className="attendance-form">
        <label htmlFor="attendance-date">직관 날짜</label>
        <input
          id="attendance-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? '저장 중...' : '저장'}
        </button>
      </form>
      {message ? (
        <p className={isError ? 'error' : 'success'}>{message}</p>
      ) : null}
    </section>
  )
}

export default AttendancePage

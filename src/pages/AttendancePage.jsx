import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const toMonthKey = (dateText) => dateText.slice(0, 7)

const buildResultLabel = (match) => {
  if (
    typeof match.hanwha_score !== 'number' ||
    typeof match.opponent_score !== 'number'
  ) {
    return match.game_status || '경기 전'
  }
  if (match.hanwha_score > match.opponent_score) {
    return `승 ${match.hanwha_score}:${match.opponent_score}`
  }
  if (match.hanwha_score < match.opponent_score) {
    return `패 ${match.hanwha_score}:${match.opponent_score}`
  }
  return `무 ${match.hanwha_score}:${match.opponent_score}`
}

function AttendancePage({ userId }) {
  const [date, setDate] = useState('')
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarError, setCalendarError] = useState('')
  const [matches, setMatches] = useState([])
  const [viewMonth, setViewMonth] = useState(
    new Date().toISOString().slice(0, 7),
  )

  useEffect(() => {
    const fetchMatches = async () => {
      if (!supabase) {
        setCalendarError('Supabase 환경변수가 비어 있어 경기 일정을 불러올 수 없습니다.')
        setCalendarLoading(false)
        return
      }
      setCalendarLoading(true)
      setCalendarError('')
      const { data, error } = await supabase
        .from('matches')
        .select(
          'id, game_date, opponent_team, stadium, game_status, hanwha_score, opponent_score',
        )
        .order('game_date', { ascending: false })

      if (error) {
        setCalendarError(error.message)
        setCalendarLoading(false)
        return
      }

      setMatches(data ?? [])
      if (!date && (data?.length ?? 0) > 0) {
        setDate(data[0].game_date)
        setViewMonth(toMonthKey(data[0].game_date))
      }
      setCalendarLoading(false)
    }

    fetchMatches()
  }, [])

  const matchesByDate = useMemo(() => {
    const map = new Map()
    matches.forEach((match) => {
      map.set(match.game_date, match)
    })
    return map
  }, [matches])

  const months = useMemo(() => {
    const monthSet = new Set(matches.map((match) => toMonthKey(match.game_date)))
    return [...monthSet].sort((a, b) => a.localeCompare(b))
  }, [matches])

  const activeMonth = useMemo(() => {
    if (!months.length) return viewMonth
    if (months.includes(viewMonth)) return viewMonth
    return months[months.length - 1]
  }, [months, viewMonth])

  const monthGrid = useMemo(() => {
    const [yearText, monthText] = activeMonth.split('-')
    const year = Number(yearText)
    const monthIndex = Number(monthText) - 1
    if (!year || monthIndex < 0 || monthIndex > 11) return []

    const firstDay = new Date(year, monthIndex, 1)
    const lastDate = new Date(year, monthIndex + 1, 0).getDate()
    const cells = []

    for (let i = 0; i < firstDay.getDay(); i += 1) {
      cells.push({ key: `blank-${i}`, isBlank: true })
    }
    for (let day = 1; day <= lastDate; day += 1) {
      const dateText = `${activeMonth}-${String(day).padStart(2, '0')}`
      const match = matchesByDate.get(dateText)
      cells.push({
        key: dateText,
        isBlank: false,
        day,
        dateText,
        match,
        isSelected: date === dateText,
      })
    }
    return cells
  }, [activeMonth, date, matchesByDate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!supabase) {
      setIsError(true)
      setMessage('Supabase 환경변수가 비어 있어 저장할 수 없습니다.')
      return
    }
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
      <div className="calendar-wrap">
        <div className="calendar-head">
          <h3>경기일 달력 선택</h3>
          {months.length ? (
            <select
              value={activeMonth}
              onChange={(event) => setViewMonth(event.target.value)}
            >
              {months.map((monthKey) => (
                <option key={monthKey} value={monthKey}>
                  {monthKey.replace('-', '년 ')}월
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {calendarLoading ? <p>달력 데이터를 불러오는 중...</p> : null}
        {calendarError ? <p className="error">{calendarError}</p> : null}
        {!calendarLoading && !calendarError && !matches.length ? (
          <p>등록된 경기 일정이 없습니다. 먼저 KBO 데이터 수집을 실행해 주세요.</p>
        ) : null}
        {!calendarLoading && !calendarError && matches.length ? (
          <>
            <div className="calendar-days">
              {DAY_LABELS.map((label) => (
                <div key={label} className="calendar-day-label">
                  {label}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {monthGrid.map((cell) =>
                cell.isBlank ? (
                  <div key={cell.key} className="calendar-cell blank" />
                ) : (
                  <button
                    key={cell.key}
                    type="button"
                    className={`calendar-cell${cell.isSelected ? ' selected' : ''}${cell.match ? ' has-match' : ''}`}
                    disabled={!cell.match}
                    onClick={() => setDate(cell.dateText)}
                  >
                    <span className="day-number">{cell.day}</span>
                    {cell.match ? (
                      <>
                        <span className="match-opponent">
                          vs {cell.match.opponent_team}
                        </span>
                        <span className="match-result">
                          {buildResultLabel(cell.match)}
                        </span>
                      </>
                    ) : (
                      <span className="match-result">경기 없음</span>
                    )}
                  </button>
                ),
              )}
            </div>
          </>
        ) : null}
      </div>
      {message ? (
        <p className={isError ? 'error' : 'success'}>{message}</p>
      ) : null}
    </section>
  )
}

export default AttendancePage

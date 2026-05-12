import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getOpponentTeamLogoUrl } from '../lib/teamLogos'
import { getKoreanHolidayLabel } from '../lib/koreanHolidays'
import { getMatchResultKind } from '../lib/stats'

const DAY_LABELS_MON = ['월', '화', '수', '목', '금', '토', '일']

const toMonthKey = (dateText) => dateText.slice(0, 7)

const localYearMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const formatMonthTitle = (ym) => {
  const [y, m] = ym.split('-')
  return `${y}년 ${Number(m)}월`
}

/** 월~일: 0~6 (월=0) */
const weekdayMonFirst = (dateText) => {
  const d = new Date(`${dateText}T12:00:00`)
  return (d.getDay() + 6) % 7
}

const resultLabelShort = (match) => {
  const kind = getMatchResultKind(match)
  if (kind === 'none' || kind === 'pending') return '경기 전'
  if (kind === 'draw') return '무'
  if (kind === 'win') return '승'
  return '패'
}

function AttendancePage({ userId }) {
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarError, setCalendarError] = useState('')
  const [matches, setMatches] = useState([])
  const [viewMonth, setViewMonth] = useState(localYearMonth)
  const [attendedSet, setAttendedSet] = useState(() => new Set())
  const [toggleBusy, setToggleBusy] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionIsError, setActionIsError] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!supabase) {
        setCalendarError('Supabase 환경변수가 비어 있어 경기 일정을 불러올 수 없습니다.')
        setCalendarLoading(false)
        return
      }

      setCalendarLoading(true)
      setCalendarError('')
      setActionMessage('')
      setActionIsError(false)

      const matchSelect =
        'id, game_date, opponent_team, stadium, game_status, hanwha_score, opponent_score, winner_team'

      const [matchRes, attRes] = await Promise.all([
        supabase.from('matches').select(matchSelect).order('game_date', { ascending: false }),
        supabase.from('user_attendance').select('attended_at').eq('user_id', userId),
      ])

      if (cancelled) return

      if (matchRes.error) {
        setCalendarError(matchRes.error.message)
        setMatches([])
      } else {
        const data = matchRes.data ?? []
        setMatches(data)
        if (data.length > 0) {
          setViewMonth((prev) => {
            const first = toMonthKey(data[0].game_date)
            const has = data.some((m) => toMonthKey(m.game_date) === prev)
            return has ? prev : first
          })
        }
      }

      if (attRes.error) {
        setActionMessage(attRes.error.message)
        setActionIsError(true)
        setAttendedSet(new Set())
      } else {
        setAttendedSet(new Set((attRes.data ?? []).map((row) => row.attended_at)))
      }

      setCalendarLoading(false)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [userId])

  const matchesByDate = useMemo(() => {
    const map = new Map()
    matches.forEach((match) => {
      map.set(match.game_date, match)
    })
    return map
  }, [matches])

  const monthGrid = useMemo(() => {
    const [yearText, monthText] = viewMonth.split('-')
    const year = Number(yearText)
    const monthIndex = Number(monthText) - 1
    if (!year || monthIndex < 0 || monthIndex > 11) return []

    const firstDay = new Date(year, monthIndex, 1)
    const lastDate = new Date(year, monthIndex + 1, 0).getDate()
    const leading = (firstDay.getDay() + 6) % 7
    const cells = []

    for (let i = 0; i < leading; i += 1) {
      cells.push({ key: `blank-${i}`, isBlank: true })
    }
    for (let day = 1; day <= lastDate; day += 1) {
      const dateText = `${viewMonth}-${String(day).padStart(2, '0')}`
      const match = matchesByDate.get(dateText)
      const holiday = getKoreanHolidayLabel(dateText)
      const dow = weekdayMonFirst(dateText)
      cells.push({
        key: dateText,
        isBlank: false,
        day,
        dateText,
        match,
        holiday,
        dow,
        isSaturday: dow === 5,
        isSunday: dow === 6,
      })
    }
    return cells
  }, [viewMonth, matchesByDate])

  const toggleAttendanceForDate = async (dateText) => {
    if (!supabase) {
      setActionMessage('Supabase 환경변수가 비어 있어 저장할 수 없습니다.')
      setActionIsError(true)
      return
    }
    if (toggleBusy) return
    setToggleBusy(true)
    setActionMessage('')
    setActionIsError(false)

    const wasAttended = attendedSet.has(dateText)

    try {
      if (wasAttended) {
        const { error } = await supabase
          .from('user_attendance')
          .delete()
          .eq('user_id', userId)
          .eq('attended_at', dateText)
        if (error) throw error
        setAttendedSet((prev) => {
          const next = new Set(prev)
          next.delete(dateText)
          return next
        })
        setActionMessage('직관일에서 제외했습니다.')
      } else {
        const match = matchesByDate.get(dateText)
        const { error } = await supabase.from('user_attendance').upsert(
          {
            user_id: userId,
            attended_at: dateText,
            match_id: match?.id ?? null,
          },
          { onConflict: 'user_id,attended_at' },
        )
        if (error) throw error
        setAttendedSet((prev) => new Set(prev).add(dateText))
        setActionMessage('직관일로 저장했습니다.')
      }
    } catch (err) {
      setActionMessage(
        err?.message ??
          '저장에 실패했습니다. Supabase에 직관 예정일 마이그레이션이 적용됐는지 확인해 주세요.',
      )
      setActionIsError(true)
    } finally {
      setToggleBusy(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setViewMonth((m) => shiftMonth(m, -1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setViewMonth((m) => shiftMonth(m, 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <section className="card form-card attendance-page">
      <h2>직관일 입력</h2>
      <p className="attendance-intro">
        달력에서 날짜를 누르면 직관(또는 직관 예정)이 바로 저장되거나 해제됩니다. 같은 날짜를
        다시 누르면 취소됩니다. 좌우 화살표 또는 키보드 방향키(← →)로 달을 옮길 수 있습니다.
      </p>

      <div className="calendar-wrap">
        <div className="calendar-head calendar-head--nav">
          <button
            type="button"
            className="calendar-month-arrow"
            aria-label="이전 달"
            disabled={calendarLoading}
            onClick={() => setViewMonth((m) => shiftMonth(m, -1))}
          >
            ‹
          </button>
          <h3 className="calendar-month-title">{formatMonthTitle(viewMonth)}</h3>
          <button
            type="button"
            className="calendar-month-arrow"
            aria-label="다음 달"
            disabled={calendarLoading}
            onClick={() => setViewMonth((m) => shiftMonth(m, 1))}
          >
            ›
          </button>
          <label className="calendar-month-jump">
            <span className="sr-only">달 이동</span>
            <input
              type="month"
              value={viewMonth}
              disabled={calendarLoading}
              onChange={(ev) => {
                if (ev.target.value) setViewMonth(ev.target.value)
              }}
            />
          </label>
        </div>

        {calendarLoading ? <p>경기 일정을 불러오는 중...</p> : null}
        {calendarError ? <p className="error">{calendarError}</p> : null}
        {!calendarLoading && !calendarError ? (
          <>
            <div className="calendar-days">
              {DAY_LABELS_MON.map((label, i) => (
                <div
                  key={label}
                  className={`calendar-day-label${i === 5 ? ' calendar-day-label--sat' : ''}${i === 6 ? ' calendar-day-label--sun' : ''}`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="calendar-grid">
              {monthGrid.map((cell) =>
                cell.isBlank ? (
                  <div key={cell.key} className="calendar-cell calendar-cell--blank" />
                ) : (
                  <button
                    key={cell.key}
                    type="button"
                    disabled={toggleBusy}
                    className={[
                      'calendar-cell',
                      cell.match ? 'calendar-cell--has-match' : 'calendar-cell--no-match',
                      attendedSet.has(cell.dateText) ? 'calendar-cell--attended' : '',
                      cell.holiday ? 'calendar-cell--holiday' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => toggleAttendanceForDate(cell.dateText)}
                  >
                    <span
                      className={[
                        'calendar-day-number',
                        cell.holiday ? 'calendar-day-number--holiday' : '',
                        !cell.holiday && cell.isSaturday ? 'calendar-day-number--sat' : '',
                        !cell.holiday && cell.isSunday ? 'calendar-day-number--sun' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {cell.day}
                    </span>
                    <span className="calendar-cell-emblem-wrap" aria-hidden={!cell.match}>
                      {cell.match ? (
                        (() => {
                          const emblemUrl = getOpponentTeamLogoUrl(cell.match.opponent_team)
                          return emblemUrl ? (
                            <img
                              className="calendar-opponent-emblem"
                              src={emblemUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              onError={(ev) => {
                                ev.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <span className="calendar-emblem-placeholder" />
                          )
                        })()
                      ) : (
                        <span className="calendar-emblem-placeholder" />
                      )}
                    </span>
                    <span
                      className={[
                        'calendar-result-badge',
                        cell.match
                          ? `calendar-result-badge--${getMatchResultKind(cell.match)}`
                          : 'calendar-result-badge--none',
                      ].join(' ')}
                    >
                      {resultLabelShort(cell.match)}
                    </span>
                    {cell.holiday ? (
                      <span className="calendar-holiday-caption">{cell.holiday}</span>
                    ) : (
                      <span className="calendar-holiday-spacer" />
                    )}
                  </button>
                ),
              )}
            </div>
          </>
        ) : null}
      </div>

      {actionMessage ? (
        <p className={actionIsError ? 'error' : 'success'}>{actionMessage}</p>
      ) : null}
    </section>
  )
}

export default AttendancePage

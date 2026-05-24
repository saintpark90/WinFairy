import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { refreshLeaderboardCache } from '../lib/refreshLeaderboard'
import { formatStadiumShort } from '../lib/stadiumShort'
import { getOpponentTeamLogoUrl } from '../lib/teamLogos'
import { getKoreanDayMark, isKoreanNonRedDayMark, isKoreanPublicHolidayMark } from '../lib/koreanHolidays'
import { getMatchResultKind, isMatchCancelled, isMatchDecided } from '../lib/stats'
import { canAccessMemberAdmin } from '../lib/admin'
import AttendanceViewersModal from '../components/AttendanceViewersModal'
import CalendarContextMenu from '../components/CalendarContextMenu'

const DAY_LABELS_MON = ['월', '화', '수', '목', '금', '토', '일']
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']
const SHOW_ATTENDEE_COUNTS_STORAGE_KEY = 'winfairy-show-attendee-counts'

const readShowAttendeeCountsPreference = () => {
  try {
    const stored = window.localStorage.getItem(SHOW_ATTENDEE_COUNTS_STORAGE_KEY)
    if (stored === '0' || stored === 'false') return false
    if (stored === '1' || stored === 'true') return true
  } catch {
    /* ignore */
  }
  return true
}

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
  if (kind === 'none') return ''
  if (kind === 'cancelled') return '취소'
  if (kind === 'pending') return '경기 전'
  if (kind === 'draw') return '무'
  if (kind === 'win') return '승'
  return '패'
}

const scoreLineForCell = (match) => {
  if (!match || !isMatchDecided(match)) return null
  if (
    typeof match.hanwha_score === 'number' &&
    typeof match.opponent_score === 'number'
  ) {
    return `${match.hanwha_score}:${match.opponent_score}`
  }
  return '—'
}

const pendingStartTimeText = (match) => {
  if (!match || isMatchDecided(match) || isMatchCancelled(match)) return null
  const t = match.game_start_time
  if (typeof t === 'string' && t.trim()) return t.trim()
  return null
}

const formatAttendanceListDate = (isoDate) => {
  const d = new Date(`${isoDate}T12:00:00`)
  const w = WEEKDAY_KO[d.getDay()]
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${w})`
}

const formatAttendanceListDateShort = (isoDate) => {
  const d = new Date(`${isoDate}T12:00:00`)
  const w = WEEKDAY_KO[d.getDay()]
  return `${d.getMonth() + 1}.${d.getDate()}(${w})`
}

const scoreTextForList = (match) => {
  const line = scoreLineForCell(match)
  if (line) return line
  const time = pendingStartTimeText(match)
  if (time) return time
  return '–'
}

function AttendancePage({ userId, user }) {
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarError, setCalendarError] = useState('')
  const [matches, setMatches] = useState([])
  const [viewMonth, setViewMonth] = useState(localYearMonth)
  const [attendedSet, setAttendedSet] = useState(() => new Set())
  const [actionMessage, setActionMessage] = useState('')
  const [isAppAdmin, setIsAppAdmin] = useState(false)
  const [contextMenu, setContextMenu] = useState(null)
  const [viewersModalDate, setViewersModalDate] = useState(null)
  const [attendeeCountByDate, setAttendeeCountByDate] = useState(() => new Map())
  const [showAttendeeCounts, setShowAttendeeCounts] = useState(readShowAttendeeCountsPreference)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const savingDateRef = useRef(new Set())
  const calendarTouchStartRef = useRef(null)

  const CALENDAR_SWIPE_THRESHOLD_PX = 48

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

      const matchSelect =
        'id, game_date, opponent_team, stadium, home_away, game_status, game_start_time, hanwha_score, opponent_score, winner_team'

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

  useEffect(() => {
    if (!supabase || !user) {
      setIsAppAdmin(false)
      return undefined
    }

    let cancelled = false
    ;(async () => {
      const [{ data: adminFlag, error: adminError }, { data: profile }] = await Promise.all([
        supabase.rpc('is_app_admin'),
        supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle(),
      ])
      if (cancelled) return
      if (adminError) {
        setIsAppAdmin(canAccessMemberAdmin(user, null))
        return
      }
      setIsAppAdmin(Boolean(adminFlag) || canAccessMemberAdmin(user, profile))
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  const loadMonthAttendeeCounts = useCallback(async () => {
    if (!supabase || !isAppAdmin || !showAttendeeCounts) {
      setAttendeeCountByDate(new Map())
      return
    }

    const [yearText, monthText] = viewMonth.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    if (!year || !month) {
      setAttendeeCountByDate(new Map())
      return
    }

    const { data, error } = await supabase.rpc('admin_attendance_counts_by_month', {
      p_year: year,
      p_month: month,
    })

    if (error) {
      console.warn('[admin_attendance_counts_by_month]', error.message)
      setAttendeeCountByDate(new Map())
      return
    }

    const next = new Map()
    ;(data ?? []).forEach((row) => {
      const dateKey =
        typeof row.attended_at === 'string' ? row.attended_at.slice(0, 10) : row.attended_at
      next.set(dateKey, Number(row.attendee_count) || 0)
    })
    setAttendeeCountByDate(next)
  }, [isAppAdmin, showAttendeeCounts, viewMonth])

  const handleShowAttendeeCountsChange = (checked) => {
    setShowAttendeeCounts(checked)
    try {
      window.localStorage.setItem(SHOW_ATTENDEE_COUNTS_STORAGE_KEY, checked ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (!checked) {
      setAttendeeCountByDate(new Map())
    }
  }

  useEffect(() => {
    void loadMonthAttendeeCounts()
  }, [loadMonthAttendeeCounts])

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
      const dayMark = getKoreanDayMark(dateText)
      const dow = weekdayMonFirst(dateText)
      cells.push({
        key: dateText,
        isBlank: false,
        day,
        dateText,
        match,
        dayMark,
        dow,
        isSaturday: dow === 5,
        isSunday: dow === 6,
      })
    }
    return cells
  }, [viewMonth, matchesByDate])

  const attendedList = useMemo(
    () =>
      [...attendedSet]
        .sort((a, b) => a.localeCompare(b))
        .map((dateText, index) => {
          const match = matchesByDate.get(dateText) ?? null
          return {
            dateText,
            order: index + 1,
            match,
            resultKind: match ? getMatchResultKind(match) : 'none',
          }
        }),
    [attendedSet, matchesByDate],
  )

  const handleRefreshMatchResults = async () => {
    if (!supabase) {
      setActionMessage('Supabase 환경변수가 비어 있어 경기 정보를 불러올 수 없습니다.')
      return
    }

    setIsRefreshing(true)
    setActionMessage('')

    try {
      // Edge Function을 호출해서 KBO 최신 경기 정보를 가져오고 Supabase 업데이트
      const { data, error } = await supabase.functions.invoke('refresh-match-results', {
        method: 'POST',
        body: {},
      })

      if (error) throw error

      // 성공 후 최신 경기 정보 재조회
      const matchSelect =
        'id, game_date, opponent_team, stadium, home_away, game_status, game_start_time, hanwha_score, opponent_score, winner_team'

      const { data: updatedMatches, error: fetchError } = await supabase
        .from('matches')
        .select(matchSelect)
        .order('game_date', { ascending: false })

      if (fetchError) throw fetchError

      setMatches(updatedMatches ?? [])

      const updated = data?.updated ?? 0
      if (updated > 0) {
        setActionMessage(`경기 결과가 ${updated}경기 갱신되었습니다.`)
      } else {
        setActionMessage('경기 정보가 최신 상태입니다.')
      }
    } catch (err) {
      setActionMessage(err?.message ?? '경기 정보 갱신에 실패했습니다.')
    } finally {
      setIsRefreshing(false)
    }
  }

  const toggleAttendanceForDate = (dateText) => {
    if (!supabase) {
      setActionMessage('Supabase 환경변수가 비어 있어 저장할 수 없습니다.')
      return
    }

    const wasAttended = attendedSet.has(dateText)
    const match = matchesByDate.get(dateText)
    /** 경기 행이 없으면 직관 저장 불가. (경기 전·종료 등 `match`가 있으면 가능) 예전에만 저장된 날은 해제만 허용 */
    if (!match && !wasAttended) return

    if (savingDateRef.current.has(dateText)) return
    savingDateRef.current.add(dateText)

    if (wasAttended) {
      setAttendedSet((prev) => {
        const next = new Set(prev)
        next.delete(dateText)
        return next
      })
    } else {
      setAttendedSet((prev) => new Set(prev).add(dateText))
    }

    void (async () => {
      try {
        if (wasAttended) {
          const { error } = await supabase
            .from('user_attendance')
            .delete()
            .eq('user_id', userId)
            .eq('attended_at', dateText)
          if (error) throw error
        } else {
          const { error } = await supabase.from('user_attendance').upsert(
            {
              user_id: userId,
              attended_at: dateText,
              match_id: match?.id ?? null,
            },
            { onConflict: 'user_id,attended_at' },
          )
          if (error) throw error
        }
        setActionMessage('')
        void refreshLeaderboardCache(supabase)
      } catch (err) {
        if (wasAttended) {
          setAttendedSet((prev) => new Set(prev).add(dateText))
        } else {
          setAttendedSet((prev) => {
            const next = new Set(prev)
            next.delete(dateText)
            return next
          })
        }
        setActionMessage(
          err?.message ??
            '저장에 실패했습니다. Supabase에 직관 예정일 마이그레이션이 적용됐는지 확인해 주세요.',
        )
      } finally {
        savingDateRef.current.delete(dateText)
      }
    })()
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

  const handleCalendarTouchStart = (event) => {
    if (calendarLoading) return
    const touch = event.touches[0]
    if (!touch) return
    calendarTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    }
  }

  const handleCalendarTouchEnd = (event) => {
    if (calendarLoading || !calendarTouchStartRef.current) return
    const touch = event.changedTouches[0]
    if (!touch) {
      calendarTouchStartRef.current = null
      return
    }

    const deltaX = touch.clientX - calendarTouchStartRef.current.x
    const deltaY = touch.clientY - calendarTouchStartRef.current.y
    calendarTouchStartRef.current = null

    if (
      Math.abs(deltaX) < CALENDAR_SWIPE_THRESHOLD_PX ||
      Math.abs(deltaX) < Math.abs(deltaY)
    ) {
      return
    }

    if (deltaX < 0) {
      setViewMonth((month) => shiftMonth(month, 1))
    } else {
      setViewMonth((month) => shiftMonth(month, -1))
    }
  }

  const handleCalendarTouchCancel = () => {
    calendarTouchStartRef.current = null
  }

  const openViewersForDate = (dateText) => {
    setViewersModalDate(dateText)
    setContextMenu(null)
  }

  const handleCalendarCellContextMenu = (event, dateText) => {
    if (!isAppAdmin) return
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, dateText })
  }

  const viewersModalMatch = viewersModalDate
    ? matchesByDate.get(viewersModalDate) ?? null
    : null

  return (
    <section className="card form-card attendance-page">
      <h2>직관일 입력</h2>
      <p className="attendance-intro">
        경기가 잡힌 날짜만 직관(또는 직관 예정)으로 저장하거나 해제할 수 있습니다. 같은 날짜를
        다시 누르면 취소됩니다. 좌우 화살표·키보드 방향키(← →), 모바일에서는 달력을
        좌우로 밀어 달을 옮길 수 있습니다.
      </p>
      {isAppAdmin ? (
        <p className="attendance-admin-hint">
          관리자: 날짜 카드를 우클릭하면 해당 날짜의 직관 회원을 확인·추가할 수 있습니다.
        </p>
      ) : null}

      <div className="calendar-wrap">
        {isAppAdmin ? (
          <label className="attendance-admin-calendar-option">
            <input
              type="checkbox"
              checked={showAttendeeCounts}
              onChange={(ev) => handleShowAttendeeCountsChange(ev.target.checked)}
            />
            <span>달력에 날짜별 직관 인원 표시</span>
          </label>
        ) : null}
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
          <button
            type="button"
            className="calendar-refresh-button"
            aria-label="경기 결과 갱신"
            disabled={calendarLoading || isRefreshing}
            onClick={handleRefreshMatchResults}
          >
            {isRefreshing ? '⟳ 갱신 중...' : '⟳ 경기결과 새로고침'}
          </button>
        </div>

        {calendarLoading ? <p>경기 일정을 불러오는 중...</p> : null}
        {calendarError ? <p className="error">{calendarError}</p> : null}
        {!calendarLoading && !calendarError ? (
          <div
            className="calendar-swipe-area"
            onTouchStart={handleCalendarTouchStart}
            onTouchEnd={handleCalendarTouchEnd}
            onTouchCancel={handleCalendarTouchCancel}
          >
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
                    className={[
                      'calendar-cell',
                      cell.match ? 'calendar-cell--has-match' : 'calendar-cell--no-match',
                      cell.match
                        ? `calendar-cell--result-${getMatchResultKind(cell.match)}`
                        : isKoreanPublicHolidayMark(cell.dayMark)
                          ? 'calendar-cell--public-holiday'
                          : isKoreanNonRedDayMark(cell.dayMark)
                            ? 'calendar-cell--memorial-day'
                            : '',
                      cell.match?.home_away === 'HOME' ? 'calendar-cell--home-game' : '',
                      cell.match && attendedSet.has(cell.dateText) ? 'calendar-cell--attended' : '',
                      isAppAdmin &&
                      showAttendeeCounts &&
                      (attendeeCountByDate.get(cell.dateText) ?? 0) > 0
                        ? 'calendar-cell--show-attendee-count'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => toggleAttendanceForDate(cell.dateText)}
                    onContextMenu={(event) => handleCalendarCellContextMenu(event, cell.dateText)}
                  >
                    {isAppAdmin &&
                    showAttendeeCounts &&
                    (attendeeCountByDate.get(cell.dateText) ?? 0) > 0 ? (
                      <span
                        className="calendar-attendee-count"
                        aria-label={`직관 ${attendeeCountByDate.get(cell.dateText)}명`}
                      >
                        {attendeeCountByDate.get(cell.dateText)}
                      </span>
                    ) : null}
                    <div className="calendar-cell-head">
                      <span
                        className={[
                          'calendar-day-number',
                          isKoreanPublicHolidayMark(cell.dayMark)
                            ? 'calendar-day-number--public-holiday'
                            : '',
                          isKoreanNonRedDayMark(cell.dayMark) ? 'calendar-day-number--memorial-day' : '',
                          !cell.dayMark && cell.isSaturday ? 'calendar-day-number--sat' : '',
                          !cell.dayMark && cell.isSunday ? 'calendar-day-number--sun' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {cell.day}
                      </span>
                      {cell.match ? (
                        <div className="calendar-cell-emblem-head">
                          {(() => {
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
                          })()}
                          <span
                            className={[
                              'calendar-result-under-emblem',
                              `calendar-result-under-emblem--${getMatchResultKind(cell.match)}`,
                            ].join(' ')}
                          >
                            {resultLabelShort(cell.match)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    {cell.match ? (
                      <div className="calendar-cell-score-row">
                        <div className="calendar-cell-score-side">
                          {(() => {
                            const scoreText = scoreLineForCell(cell.match)
                            const timeText = pendingStartTimeText(cell.match)
                            if (scoreText) {
                              return (
                                <span className="calendar-score-line" title="한화 – 상대">
                                  {scoreText}
                                </span>
                              )
                            }
                            if (timeText) {
                              return (
                                <span className="calendar-game-time calendar-game-time--in-score-row">
                                  {timeText}
                                </span>
                              )
                            }
                            return (
                              <span className="calendar-game-time calendar-game-time--muted">–</span>
                            )
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="calendar-cell-main-spacer" aria-hidden="true" />
                    )}
                    {cell.dayMark ? (
                      <span
                        className={[
                          'calendar-holiday-caption',
                          isKoreanNonRedDayMark(cell.dayMark) ? 'calendar-holiday-caption--muted' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {cell.dayMark.caption}
                      </span>
                    ) : (
                      <span className="calendar-holiday-spacer" />
                    )}
                    {cell.match && attendedSet.has(cell.dateText) ? (
                      <span className="calendar-attendance-check" aria-hidden="true">
                        <svg
                          className="calendar-attendance-check-svg"
                          viewBox="0 0 20 20"
                          focusable="false"
                        >
                          <path
                            className="calendar-attendance-check-path"
                            d="M4.5 10.35 8.85 14.5 15.5 5.5"
                          />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                ),
              )}
            </div>
            <div className="calendar-legend" aria-label="달력 표시 안내">
              <span className="calendar-legend-item">
                <span
                  className="calendar-legend-swatch calendar-legend-swatch--home"
                  aria-hidden
                />
                홈경기
              </span>
              <span className="calendar-legend-item">
                <span
                  className="calendar-legend-swatch calendar-legend-swatch--win"
                  aria-hidden
                />
                승리
              </span>
              <span className="calendar-legend-item">
                <span
                  className="calendar-legend-swatch calendar-legend-swatch--loss"
                  aria-hidden
                />
                패배
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {!calendarLoading && !calendarError ? (
        <div className="attendance-list-wrap">
          <p className="attendance-list-summary">
            총 <strong>{attendedList.length}</strong>경기 직관
          </p>
          {attendedList.length ? (
            <div className="table-wrap attendance-list-table-wrap">
              <table className="attendance-list-table">
                <thead>
                  <tr>
                    <th scope="col">순서</th>
                    <th scope="col">날짜</th>
                    <th scope="col">상대팀</th>
                    <th scope="col">경기장</th>
                    <th scope="col">스코어</th>
                    <th scope="col">경기결과</th>
                  </tr>
                </thead>
                <tbody>
                  {attendedList.map((row) => {
                    const logoUrl = row.match
                      ? getOpponentTeamLogoUrl(row.match.opponent_team)
                      : null
                    return (
                      <tr
                        key={row.dateText}
                        className={`attendance-list-row attendance-list-row--${row.resultKind}`}
                      >
                        <td>{row.order}</td>
                        <td className="attendance-list-date" title={formatAttendanceListDate(row.dateText)}>
                          <span className="attendance-list-date-full">
                            {formatAttendanceListDate(row.dateText)}
                          </span>
                          <span className="attendance-list-date-short">
                            {formatAttendanceListDateShort(row.dateText)}
                          </span>
                        </td>
                        <td className="attendance-list-opponent-cell">
                          {row.match ? (
                            <span className="attendance-list-opponent">
                              {logoUrl ? (
                                <img
                                  className="team-logo-inline"
                                  src={logoUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : null}
                              <span title={row.match.opponent_team ?? ''}>
                                {row.match.opponent_team ?? '–'}
                              </span>
                            </span>
                          ) : (
                            '–'
                          )}
                        </td>
                        <td
                          className="attendance-list-stadium"
                          title={row.match?.stadium ?? ''}
                        >
                          {row.match ? formatStadiumShort(row.match.stadium) : '–'}
                        </td>
                        <td>{row.match ? scoreTextForList(row.match) : '–'}</td>
                        <td>
                          {row.match ? (
                            <span
                              className={[
                                'attendance-list-result',
                                `attendance-list-result--${row.resultKind}`,
                              ].join(' ')}
                            >
                              {resultLabelShort(row.match)}
                            </span>
                          ) : (
                            '–'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted attendance-list-empty">
              달력에서 날짜를 선택하면 직관 목록에 표시됩니다.
            </p>
          )}
        </div>
      ) : null}

      {actionMessage ? <p className="error">{actionMessage}</p> : null}

      {isAppAdmin && contextMenu ? (
        <CalendarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              id: 'view-attendees',
              label: '직관러 확인',
              onSelect: () => openViewersForDate(contextMenu.dateText),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {isAppAdmin && viewersModalDate ? (
        <AttendanceViewersModal
          dateText={viewersModalDate}
          match={viewersModalMatch}
          onClose={() => setViewersModalDate(null)}
          onAttendanceChanged={loadMonthAttendeeCounts}
        />
      ) : null}
    </section>
  )
}

export default AttendancePage

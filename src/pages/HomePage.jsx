import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildDailyPlayerPicks } from '../lib/dailyPlayerPicks'
import {
  buildDashboardStats,
  formatBattingAvg,
  formatInningsFromOuts,
  getMatchResultKind,
  isMatchCancelled,
} from '../lib/stats'
import { getOpponentTeamLogoUrl } from '../lib/teamLogos'

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

const formatRecentGameDate = (isoDate) => {
  const d = new Date(`${isoDate}T12:00:00`)
  const w = WEEKDAY_KO[d.getDay()]
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} (${w})`
}

const recentGameResultLabel = (match) => {
  const k = getMatchResultKind(match)
  if (k === 'win') return '승'
  if (k === 'loss') return '패'
  if (k === 'draw') return '무'
  if (k === 'cancelled') return '취소'
  if (k === 'pending') return '경기 전'
  return '–'
}

/** 직관 최근 N경기 카드: 경기 전·취소·스코어 미기록 제외 */
const hasRecordedScore = (match) =>
  Boolean(
    match &&
      !isMatchCancelled(match) &&
      typeof match.hanwha_score === 'number' &&
      typeof match.opponent_score === 'number',
  )

const recentGameScoreText = (match) => {
  if (!hasRecordedScore(match)) return '–'
  return `${match.hanwha_score}:${match.opponent_score}`
}

const getWinRateComment = (winRate, totalGames, userDisplayName) => {
  if (totalGames < 3) {
    return '3경기 이상 직관정보 입력시 멘트가 표기됩니다.'
  }
  if (winRate === 0) {
    return '혹시... 상대 팀 스파이신가요? 🕵️‍♂️\n오늘부터는 야구장 대신 절이나 교회를 가보시는 건 어떨까요?'
  }
  if (winRate < 20) {
    return '누구보다 슬프시겠어요! 😭\n하지만 통계적으로 이제 올라갈 일만 남았다는 사실! 기적의 반등을 믿어봅시다. 화이팅!'
  }
  if (winRate < 30) {
    return `이 정도면 직관 가는 날이 곧 수행의 날이겠네요. 🙏\n진정한 팬심이 아니고선 버틸 수 없는 승률입니다.\n ${userDisplayName}님이 진정한 보살팬!`
  }
  if (winRate < 40) {
    return '가끔 이기는 그 짜릿함 때문에 포기를 못 하시죠? 🎢\n조만간 연승 요정으로 진화하실 기운이 느껴집니다! \n아자아자!'
  }
  if (winRate < 50) {
    return "딱 평균 직전! 턱걸이 중입니다. 🧗‍♂️\n다음 경기 결과에 따라 '5할 승률'의 고지가 머지않았어요!"
  }
  if (winRate < 60) {
    return `완벽한 균형, 황금 밸런스! ⚖️\n${userDisplayName}님이 가는 날은 그야말로 \n'엄마가 좋아 아빠가 좋아'급 박빙의 승부가 펼쳐지겠군요.`
  }
  if (winRate < 70) {
    return "오! 슬슬 '승리요정'의 날개가 돋아나고 있어요. 🧚‍♀️\n주변 친구들에게 나 승요라고 자랑하셔도 되겠는데요?"
  }
  if (winRate < 80) {
    return '당신은 이미 팀의 소중한 자산입니다! 💎\n유니폼 대신 요정 옷을 입고 입장하셔도 아무도 뭐라 안 할 승률이에요.'
  }
  if (winRate < 90) {
    return `걸어 다니는 승리 부적! 🧿 구단에서 연락 안 왔나요? \n선발 투수 컨디션보다 ${userDisplayName}님 직관 여부가 더 중요해 보입니다.`
  }
  if (winRate < 100) {
    return `이 정도면 거의 야구의 신이 보살피는 수준! ⚡️\n${userDisplayName}님 야구장에 나타나면 상대 팀 팬들은 미리 절망해야겠는데요?`
  }
  return `살아있는 전설, 무패신화! 👑\n${userDisplayName}님이 바로 진정한 승리요정입니다!\n직관해주셔서 감사합니다!`
}

const formatStatValue = (value, digits = 3) => {
  if (value == null || Number.isNaN(value)) return '-'
  if (typeof value === 'number') {
    return value.toFixed(digits).replace(/\.?0+$/, '')
  }
  return String(value)
}

const WarInfoHeader = () => (
  <span className="top5-header-with-tip">
    WAR
    <span
      className="top5-info-tip"
      role="button"
      tabIndex={0}
      aria-label="WAR 대체 지표 안내"
    >
      ?
      <span className="top5-info-tip-bubble" role="tooltip">
        KBO는 공식적으로 WAR를 제공하지 않습니다. 이 값은 경기 WPA 기반 대체 지표입니다.
      </span>
    </span>
  </span>
)

const formatOpponentRuns = (row) =>
  row.scoredGames > 0 ? row.runsScored : '-'

const formatOpponentRunsAllowed = (row) =>
  row.scoredGames > 0 ? row.runsAllowed : '-'

const formatOpponentAvgRuns = (total, scoredGames) => {
  if (!scoredGames) return '-'
  return (total / scoredGames).toFixed(1)
}

const StatSection = ({
  title,
  rows,
  showTeamLogoInLabel = false,
  sectionClassName = '',
  showRank = false,
  showRunsColumns = false,
}) => (
  <section className={['card', sectionClassName].filter(Boolean).join(' ')}>
    <h3>{title}</h3>
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {showRank ? <th className="stat-rank-col">순위</th> : null}
            <th>구분</th>
            <th>경기</th>
            <th>승</th>
            <th>패</th>
            <th>무</th>
            <th>승률</th>
            {showRunsColumns ? (
              <>
                <th>득점</th>
                <th>실점</th>
                <th>평균득점</th>
                <th>평균실점</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const logoUrl = showTeamLogoInLabel ? getOpponentTeamLogoUrl(row.label) : null
            return (
              <tr key={row.label}>
                {showRank ? <td className="stat-rank-col">{index + 1}</td> : null}
                <td>
                  {showTeamLogoInLabel ? (
                    <span className="team-label-cell">
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
                      <span className="team-label-text">{row.label}</span>
                    </span>
                  ) : (
                    row.label
                  )}
                </td>
                <td>{row.total}</td>
                <td>{row.wins}</td>
                <td>{row.losses ?? 0}</td>
                <td>{row.draws ?? 0}</td>
                <td>{row.winRate}%</td>
                {showRunsColumns ? (
                  <>
                    <td>{formatOpponentRuns(row)}</td>
                    <td>{formatOpponentRunsAllowed(row)}</td>
                    <td>{formatOpponentAvgRuns(row.runsScored, row.scoredGames)}</td>
                    <td>{formatOpponentAvgRuns(row.runsAllowed, row.scoredGames)}</td>
                  </>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </section>
)

function HomePage({ userId, userDisplayName }) {
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [allMatches, setAllMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        setError('Supabase 환경변수가 비어 있어 데이터를 불러올 수 없습니다.')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      const matchFields =
        'id, game_date, stadium, opponent_team, home_away, winner_team, player_stats, hanwha_score, opponent_score, game_start_time, game_status'
      const [
        { data: attendanceRows, error: attendanceError },
        { data: matchesRows, error: matchesError },
      ] =
        await Promise.all([
          supabase
            .from('user_attendance')
            .select(`attended_at, match_id, match:matches(${matchFields})`)
            .eq('user_id', userId)
            .order('attended_at', { ascending: false }),
          supabase.from('matches').select(matchFields),
        ])

      const queryError = attendanceError || matchesError
      if (queryError) {
        setError(queryError.message)
        setAttendanceRecords([])
        setAllMatches([])
      } else {
        const matches = matchesRows ?? []
        setAllMatches(matches)
        const byDate = new Map(matches.map((m) => [m.game_date, m]))
        const enriched = (attendanceRows ?? []).map((row) => ({
          attended_at: row.attended_at,
          match_id: row.match_id,
          match: row.match ?? byDate.get(row.attended_at) ?? null,
        }))
        setAttendanceRecords(enriched)
      }
      setLoading(false)
    }

    fetchData()
  }, [userId])

  const stats = useMemo(
    () => buildDashboardStats(attendanceRecords),
    [attendanceRecords],
  )
  const dailyPicks = useMemo(
    () => buildDailyPlayerPicks(attendanceRecords),
    [attendanceRecords],
  )
  const winRateComment = useMemo(
    () => getWinRateComment(stats.summary.winRate, stats.summary.totalGames, userDisplayName),
    [stats.summary.totalGames, stats.summary.winRate, userDisplayName],
  )

  /** 직관 + 스코어 확정(한화·상대 점수 숫자)만, 경기일 최신순 최대 5경기 */
  const recentFiveGames = useMemo(() => {
    const withScoredMatch = attendanceRecords.filter(
      (r) => r.match && hasRecordedScore(r.match),
    )
    withScoredMatch.sort((a, b) => {
      const dateCmp = String(b.match.game_date).localeCompare(String(a.match.game_date))
      if (dateCmp !== 0) return dateCmp
      return String(b.attended_at).localeCompare(String(a.attended_at))
    })
    const seenDates = new Set()
    const out = []
    for (const r of withScoredMatch) {
      const d = r.match.game_date
      if (seenDates.has(d)) continue
      seenDates.add(d)
      out.push(r.match)
      if (out.length >= 5) break
    }
    return out
  }, [attendanceRecords])

  return (
    <div className="dashboard">
      {loading ? (
        <p className="center-text">통계 데이터를 불러오는 중...</p>
      ) : null}
      {error ? <p className="center-text error">{error}</p> : null}
      {!loading && !error && !attendanceRecords.length ? (
        <p className="center-text">
          아직 직관 입력 데이터가 없습니다. 상단 메뉴에서 직관일을 추가해 주세요.
        </p>
      ) : null}
      {!loading && !error && attendanceRecords.length ? (
        <>
          <div className="dashboard-hero-row">
            <section className="hero-card">
              <h2>{userDisplayName}님의 승률은?</h2>
              <p className="big-number">{stats.summary.winRate}%</p>
              <p>
                {stats.summary.wins}승 {stats.summary.losses}패
                {stats.summary.draws > 0 ? ` ${stats.summary.draws}무` : ''}  
                / 총 직관 {stats.summary.totalGames}경기
              </p>
              <p className="win-rate-comment">{winRateComment}</p>
            </section>
            <section className="card recent-games-card">
              <h3 className="recent-games-title">직관 최근 5경기</h3>
              {recentFiveGames.length ? (
                <div className="recent-games-scroll">
                  <div
                    className="recent-game-line recent-game-line--header"
                    aria-hidden="true"
                  >
                    <span className="recent-game-colhead">날짜</span>
                    <span className="recent-game-colhead">경기시간</span>
                    <span className="recent-game-colhead">경기장</span>
                    <span className="recent-game-colhead">상대</span>
                    <span className="recent-game-colhead recent-game-colhead--center">
                      스코어
                    </span>
                    <span className="recent-game-colhead recent-game-colhead--end">
                      경기결과
                    </span>
                  </div>
                  <ul className="recent-games-list">
                  {recentFiveGames.map((m) => {
                    const logoUrl = getOpponentTeamLogoUrl(m.opponent_team)
                    const timeText =
                      typeof m.game_start_time === 'string' && m.game_start_time.trim()
                        ? m.game_start_time.trim()
                        : '–'
                    const kind = getMatchResultKind(m)
                    return (
                      <li key={m.id ?? m.game_date} className="recent-game-line">
                        <span className="recent-game-date">{formatRecentGameDate(m.game_date)}</span>
                        <span className="recent-game-time">{timeText}</span>
                        <span className="recent-game-stadium" title={m.stadium ?? ''}>
                          {m.stadium ?? '–'}
                        </span>
                        <span
                          className="recent-game-opponent"
                          title={m.opponent_team ?? ''}
                        >
                          {logoUrl ? (
                            <img
                              className="recent-game-logo"
                              src={logoUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <span className="recent-game-logo-fallback" aria-hidden="true" />
                          )}
                          <span className="recent-game-opponent-name">
                            {m.opponent_team ?? '–'}
                          </span>
                        </span>
                        <span className="recent-game-score">{recentGameScoreText(m)}</span>
                        <span
                          className={[
                            'recent-game-result',
                            `recent-game-result--${kind}`,
                          ].join(' ')}
                        >
                          {recentGameResultLabel(m)}
                        </span>
                      </li>
                    )
                  })}
                  </ul>
                </div>
              ) : (
                <p className="muted recent-games-empty">
                  직관한 경기 중 스코어가 기록된 경기가 없습니다. 경기 전·취소 등은 표시하지
                  않습니다.
                </p>
              )}
            </section>
          </div>

          <div className="dashboard-stadium-row">
            <div className="dashboard-stadium-left">
              <StatSection
                title="경기장 별 승률"
                rows={stats.byStadium}
                sectionClassName="stat-card-stadium"
                showRank
              />
            </div>
            <div className="dashboard-stadium-right">
              <StatSection title="홈 / 원정 승률" rows={stats.byHomeAway} showRank />
              <StatSection
                title="평일 / 주말(공휴일) 승률"
                rows={stats.byWeekType}
                sectionClassName="stat-card-weekstretch"
                showRank
              />
            </div>
          </div>
          <StatSection
            title="상대팀 별 승률"
            rows={stats.byOpponent}
            showTeamLogoInLabel
            showRank
            showRunsColumns
          />

          <section className="card dashboard-daily-picks-row" aria-label="오늘의 유니폼 추천">
            {dailyPicks.uniform ? (
              <p className="daily-pick-line">
                <span className="daily-pick-line-label">⚾ 오늘 나의 운명의 추천 유니폼 마킹은? :</span>
                <span className="daily-pick-line-value">
                  {dailyPicks.uniform.number != null
                    ? `${dailyPicks.uniform.number}번 `
                    : ''}
                  {dailyPicks.uniform.playerName} 🦅
                </span>
              </p>
            ) : (
              <p className="muted daily-pick-line">
                오늘 나의 유니폼 추천 마킹 : 직관한 경기의 한화 선수 기록이 쌓이면 추천해 드려요.
              </p>
            )}
          </section>

          <section className="card grid2">
            <div>
              <h3>직관일 기준 타자 TOP5</h3>
              <p className="top5-hint">
                내가 직관갔던 날엔 누가 최고의 타자였을까?
              </p>
              {stats.topBatters.length ? (
                <div className="table-wrap top5-table-wrap">
                  <table className="top5-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>선수</th>
                        <th>
                          <WarInfoHeader />
                        </th>
                        <th>타율</th>
                        <th>안타</th>
                        <th>홈런</th>
                        <th>타점</th>
                        <th>득점</th>
                        <th>OPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topBatters.map((player, index) => (
                        <tr key={player.playerName}>
                          <td>{index + 1}</td>
                          <td className="top5-player-name">{player.playerName}</td>
                          <td>{formatStatValue(player.war)}</td>
                          <td>{formatBattingAvg(player.battingAvg)}</td>
                          <td>{player.hits ?? 0}</td>
                          <td>{player.homeRuns ?? 0}</td>
                          <td>{player.rbi ?? 0}</td>
                          <td>{player.runs ?? 0}</td>
                          <td>{formatStatValue(player.ops)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">표시할 타자 기록이 없습니다.</p>
              )}
            </div>
            <div>
              <h3>직관일 기준 투수 TOP5</h3>
              <p className="top5-hint">
                내가 직관 간 날의 에이스는? 
              </p>
              {stats.topPitchers.length ? (
                <div className="table-wrap top5-table-wrap">
                  <table className="top5-table">
                    <thead>
                      <tr>
                        <th>순위</th>
                        <th>선수</th>
                        <th>
                          <WarInfoHeader />
                        </th>
                        <th>ERA</th>
                        <th>이닝</th>
                        <th>탈삼진</th>
                        <th>승리</th>
                        <th>홀드</th>
                        <th>세이브</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topPitchers.map((player, index) => (
                        <tr key={player.playerName}>
                          <td>{index + 1}</td>
                          <td className="top5-player-name">{player.playerName}</td>
                          <td>{formatStatValue(player.war)}</td>
                          <td>{formatStatValue(player.era, 2)}</td>
                          <td>{formatInningsFromOuts(player.inningsOuts)}</td>
                          <td>{player.strikeouts ?? 0}</td>
                          <td>{player.wins ?? 0}</td>
                          <td>{player.holds ?? 0}</td>
                          <td>{player.saves ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">표시할 투수 기록이 없습니다.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

export default HomePage

import { useMemo, useState } from 'react'
import {
  buildAllAttendancePlayers,
  formatBattingAvg,
  formatInningsFromOuts,
} from '../lib/stats'

const TOP_LIMIT = 10

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

function BatterTable({ players, rankByList }) {
  if (!players.length) {
    return <p className="muted">표시할 타자 기록이 없습니다.</p>
  }

  return (
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
          {players.map((player) => {
            const rankIndex = rankByList.findIndex(
              (p) => p.playerName === player.playerName,
            )
            const rank = rankIndex >= 0 ? rankIndex + 1 : '–'
            return (
              <tr key={player.playerName}>
                <td>{rank}</td>
                <td className="top5-player-name">{player.playerName}</td>
                <td>{formatStatValue(player.war)}</td>
                <td>{formatBattingAvg(player.battingAvg)}</td>
                <td>{player.hits ?? 0}</td>
                <td>{player.homeRuns ?? 0}</td>
                <td>{player.rbi ?? 0}</td>
                <td>{player.runs ?? 0}</td>
                <td>{formatStatValue(player.ops)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PitcherTable({ players, rankByList }) {
  if (!players.length) {
    return <p className="muted">표시할 투수 기록이 없습니다.</p>
  }

  return (
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
          {players.map((player) => {
            const rankIndex = rankByList.findIndex(
              (p) => p.playerName === player.playerName,
            )
            const rank = rankIndex >= 0 ? rankIndex + 1 : '–'
            return (
              <tr key={player.playerName}>
                <td>{rank}</td>
                <td className="top5-player-name">{player.playerName}</td>
                <td>{formatStatValue(player.war)}</td>
                <td>{formatStatValue(player.era, 2)}</td>
                <td>{formatInningsFromOuts(player.inningsOuts)}</td>
                <td>{player.strikeouts ?? 0}</td>
                <td>{player.wins ?? 0}</td>
                <td>{player.holds ?? 0}</td>
                <td>{player.saves ?? 0}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AttendancePlayerRankings({ attendanceRecords }) {
  const [searchQuery, setSearchQuery] = useState('')

  const allBatters = useMemo(
    () => buildAllAttendancePlayers(attendanceRecords, 'batter'),
    [attendanceRecords],
  )
  const allPitchers = useMemo(
    () => buildAllAttendancePlayers(attendanceRecords, 'pitcher'),
    [attendanceRecords],
  )

  const topBatters = useMemo(
    () => allBatters.slice(0, TOP_LIMIT),
    [allBatters],
  )
  const topPitchers = useMemo(
    () => allPitchers.slice(0, TOP_LIMIT),
    [allPitchers],
  )

  const searchOptionNames = useMemo(() => {
    const names = new Set([
      ...allBatters.map((p) => p.playerName),
      ...allPitchers.map((p) => p.playerName),
    ])
    return [...names].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [allBatters, allPitchers])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const searchBatters = useMemo(() => {
    if (!normalizedQuery) return []
    return allBatters.filter((p) =>
      p.playerName.toLowerCase().includes(normalizedQuery),
    )
  }, [allBatters, normalizedQuery])

  const searchPitchers = useMemo(() => {
    if (!normalizedQuery) return []
    return allPitchers.filter((p) =>
      p.playerName.toLowerCase().includes(normalizedQuery),
    )
  }, [allPitchers, normalizedQuery])

  const hasSearch = normalizedQuery.length > 0
  const hasSearchResults = searchBatters.length > 0 || searchPitchers.length > 0

  return (
    <section className="card team-stats-player-rankings">
      <h3>직관일 기준 선수 기록</h3>
      <p className="top5-hint">
        내가 직관한 경기(승패 확정) 기준입니다. TOP {TOP_LIMIT}에 없는 선수도 이름으로 검색할 수
        있습니다.
      </p>

      <div className="team-stats-player-search">
        <label className="team-stats-player-search-label" htmlFor="team-stats-player-search">
          선수 검색
        </label>
        <input
          id="team-stats-player-search"
          className="team-stats-player-search-input"
          type="search"
          list="team-stats-player-search-options"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="선수 이름 입력"
          autoComplete="off"
        />
        <datalist id="team-stats-player-search-options">
          {searchOptionNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      {hasSearch ? (
        <div className="player-search-results">
          <h4 className="player-search-results-title">검색 결과</h4>
          {!hasSearchResults ? (
            <p className="muted">일치하는 선수가 없습니다.</p>
          ) : (
            <div className="player-search-results-grid">
              {searchBatters.length ? (
                <div>
                  <h5 className="player-search-results-subtitle">타자</h5>
                  <BatterTable players={searchBatters} rankByList={allBatters} />
                </div>
              ) : null}
              {searchPitchers.length ? (
                <div>
                  <h5 className="player-search-results-subtitle">투수</h5>
                  <PitcherTable players={searchPitchers} rankByList={allPitchers} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid2 team-stats-top10-grid">
        <div>
          <h4 className="team-stats-top10-heading">직관일 기준 타자 TOP{TOP_LIMIT}</h4>
          <p className="top5-hint">내가 직관갔던 날엔 누가 최고의 타자였을까?</p>
          <BatterTable players={topBatters} rankByList={allBatters} />
        </div>
        <div>
          <h4 className="team-stats-top10-heading">직관일 기준 투수 TOP{TOP_LIMIT}</h4>
          <p className="top5-hint">내가 직관 간 날의 에이스는?</p>
          <PitcherTable players={topPitchers} rankByList={allPitchers} />
        </div>
      </div>
    </section>
  )
}

export default AttendancePlayerRankings

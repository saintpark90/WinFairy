import {
  buildBackNumberMapFromRecords,
  getHanwhaUniformNumber,
} from './hanwhaRosterNumbers'
import { buildTopPlayers } from './stats'

const WAR_TOP_N = 10

export function getKstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date)
}

const hashString = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const pickDailyIndex = (poolLength, dateKey, salt) => {
  if (poolLength <= 0) return -1
  return hashString(`${dateKey}:${salt}`) % poolLength
}

/** 직관일 기준 타자·투수 WAR TOP 10 합집합 (유니폼 추천 후보) */
export function buildUniformWarTopPool(attendanceRecords) {
  const names = new Set()
  ;['batter', 'pitcher'].forEach((type) => {
    buildTopPlayers(attendanceRecords, type, WAR_TOP_N)
      .filter((player) => player.war != null)
      .forEach((player) => names.add(player.playerName))
  })
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'))
}

/**
 * @returns {{
 *   dateKey: string,
 *   uniform: { playerName: string, number: number | null } | null,
 * }}
 */
export function buildDailyPlayerPicks(attendanceRecords, dateKey = getKstDateKey()) {
  const namePool = buildUniformWarTopPool(attendanceRecords)
  const backNumberMap = buildBackNumberMapFromRecords(attendanceRecords)
  const uniformIdx = pickDailyIndex(namePool.length, dateKey, 'uniform-mark')
  const uniformName = uniformIdx >= 0 ? namePool[uniformIdx] : null

  return {
    dateKey,
    uniform: uniformName
      ? {
          playerName: uniformName,
          number: getHanwhaUniformNumber(uniformName, backNumberMap),
        }
      : null,
  }
}

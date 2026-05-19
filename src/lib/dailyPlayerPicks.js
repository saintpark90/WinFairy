import {
  buildBackNumberMapFromRecords,
  getHanwhaUniformNumber,
} from './hanwhaRosterNumbers'
import { buildTopPlayers } from './stats'

const WPA_TOP_N = 10

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

/** 직관일 기준 타자·투수 WPA TOP 10 합집합 (유니폼 추천 후보) */
export function buildUniformWpaTopPool(attendanceRecords) {
  const names = new Set()
  ;['batter', 'pitcher'].forEach((type) => {
    buildTopPlayers(attendanceRecords, type, WPA_TOP_N)
      .filter((player) => player.wpa != null)
      .forEach((player) => names.add(player.playerName))
  })
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'))
}

/**
 * @param {Array} attendanceRecords
 * @param {string} [dateKey] KST 날짜 (YYYY-MM-DD)
 * @param {string} [userId] 로그인 사용자 ID — 같은 날짜라도 사용자마다 다른 추천
 * @returns {{
 *   dateKey: string,
 *   uniform: { playerName: string, number: number | null } | null,
 * }}
 */
export function buildDailyPlayerPicks(
  attendanceRecords,
  dateKey = getKstDateKey(),
  userId = '',
) {
  const namePool = buildUniformWpaTopPool(attendanceRecords)
  const backNumberMap = buildBackNumberMapFromRecords(attendanceRecords)
  const userSalt = userId ? String(userId) : 'guest'
  const uniformIdx = pickDailyIndex(namePool.length, dateKey, `${userSalt}:uniform-mark`)
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

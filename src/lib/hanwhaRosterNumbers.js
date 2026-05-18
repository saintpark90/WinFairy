import rosterNumbers from '../data/hanwhaRosterNumbers.json'
import { isMatchDecided } from './stats'

const HANWHA_NAME = '한화'

const normalizePlayerName = (name) =>
  String(name || '')
    .trim()
    .replace(/\s+/g, '')

const lookupRosterJson = (playerName) => {
  if (!playerName) return null
  const trimmed = String(playerName).trim()
  if (rosterNumbers[trimmed] != null) return rosterNumbers[trimmed]
  const compact = normalizePlayerName(trimmed)
  for (const [key, num] of Object.entries(rosterNumbers)) {
    if (normalizePlayerName(key) === compact) return num
  }
  return null
}

/** 직관 경기 player_stats에 저장된 back_number 우선 집계 */
export function buildBackNumberMapFromRecords(attendanceRecords) {
  const tally = new Map()

  attendanceRecords.forEach((record) => {
    if (!record.match || !isMatchDecided(record.match)) return
    ;(record.match.player_stats ?? []).forEach((player) => {
      if (!player?.team_name?.includes(HANWHA_NAME) || !player.player_name) return
      const number = Number(player.back_number)
      if (!Number.isFinite(number)) return

      const key = normalizePlayerName(player.player_name)
      const counts = tally.get(key) ?? new Map()
      counts.set(number, (counts.get(number) ?? 0) + 1)
      tally.set(key, counts)
    })
  })

  const resolved = {}
  tally.forEach((counts, name) => {
    let best = null
    let bestCount = -1
    counts.forEach((count, number) => {
      if (count > bestCount) {
        best = number
        bestCount = count
      }
    })
    if (best != null) resolved[name] = best
  })
  return resolved
}

/**
 * 등번호 조회: 1) 경기 기록 back_number 2) KBO 선수등록 JSON
 * @param {string} playerName
 * @param {Record<string, number>} [fromRecords]
 */
export function getHanwhaUniformNumber(playerName, fromRecords = {}) {
  if (!playerName) return null
  const key = normalizePlayerName(playerName)
  if (fromRecords[key] != null) return fromRecords[key]

  const trimmed = String(playerName).trim()
  if (fromRecords[trimmed] != null) return fromRecords[trimmed]

  return lookupRosterJson(playerName)
}

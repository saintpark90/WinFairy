import { supabaseUrl } from './supabase'

export const LEADERBOARD_STORAGE_PATH = 'public-data/leaderboard.json'

export const getLeaderboardStorageUrl = () => {
  if (!supabaseUrl) return ''
  return `${supabaseUrl}/storage/v1/object/public/${LEADERBOARD_STORAGE_PATH}`
}

async function fetchStorageLeaderboard() {
  const storageUrl = getLeaderboardStorageUrl()
  if (!storageUrl) return []

  try {
    const response = await fetch(`${storageUrl}?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!response.ok) return []
    const data = await response.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function pickProfileDisplayName(primary, secondary) {
  const p = primary != null ? String(primary).trim() : ''
  if (p) return p
  const s = secondary != null ? String(secondary).trim() : ''
  return s || null
}

function normalizeLeaderboardRow(row) {
  return {
    ...row,
    games: Number(row.games ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    draws: Number(row.draws ?? 0),
    win_rate: Number(row.win_rate ?? 0),
  }
}

/**
 * RPC(전체 회원) + Storage JSON(패·무 포함)을 병합합니다.
 * Storage만 쓰면 KBO 동기화 전에 가입한 회원이 누락될 수 있습니다.
 */
export async function fetchAttendanceLeaderboard(supabase) {
  const [storageRows, rpcResult] = await Promise.all([
    fetchStorageLeaderboard(),
    supabase
      ? supabase.rpc('get_attendance_leaderboard')
      : Promise.resolve({ data: null, error: null }),
  ])

  const { data: rpcRows, error: rpcError } = rpcResult

  if (!storageRows.length && rpcError) {
    return { data: null, error: rpcError, source: null }
  }

  if (!storageRows.length && !rpcRows?.length) {
    if (!supabase) {
      return {
        data: null,
        error: new Error('Supabase 환경변수가 비어 있습니다.'),
        source: null,
      }
    }
    return { data: [], error: null, source: 'rpc' }
  }

  const byUserId = new Map()

  for (const row of rpcRows ?? []) {
    byUserId.set(row.user_id, normalizeLeaderboardRow(row))
  }

  for (const row of storageRows) {
    const existing = byUserId.get(row.user_id)
    if (existing) {
      // RPC가 집계 기준(경기·승·승률·패·무). Storage는 RPC에 없는 회원 보완용.
      byUserId.set(
        row.user_id,
        normalizeLeaderboardRow({
          ...existing,
          avatar_url: row.avatar_url ?? existing.avatar_url,
          display_name: row.display_name ?? existing.display_name,
          display_alias: row.display_alias ?? existing.display_alias ?? null,
          profile_display_name: pickProfileDisplayName(
            row.profile_display_name,
            existing.profile_display_name,
          ),
        }),
      )
    } else {
      byUserId.set(row.user_id, normalizeLeaderboardRow(row))
    }
  }

  const data = [...byUserId.values()].sort((a, b) => {
    const label = (row) => String(row.display_name ?? '')
    return (
      b.wins - a.wins ||
      b.games - a.games ||
      label(a).localeCompare(label(b), 'ko')
    )
  })

  const source =
    storageRows.length && rpcRows?.length
      ? 'merged'
      : storageRows.length
        ? 'storage'
        : 'rpc'

  return { data, error: null, source }
}

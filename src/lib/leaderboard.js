import { supabaseUrl } from './supabase'

export const LEADERBOARD_STORAGE_PATH = 'public-data/leaderboard.json'

export const getLeaderboardStorageUrl = () => {
  if (!supabaseUrl) return ''
  return `${supabaseUrl}/storage/v1/object/public/${LEADERBOARD_STORAGE_PATH}`
}

/** Storage JSON(패·무 포함) 우선, 실패 시 RPC 결과 사용 */
export async function fetchAttendanceLeaderboard(supabase) {
  const storageUrl = getLeaderboardStorageUrl()
  if (storageUrl) {
    try {
      const response = await fetch(`${storageUrl}?t=${Date.now()}`, {
        cache: 'no-store',
      })
      if (response.ok) {
        const data = await response.json()
        if (Array.isArray(data) && data.length) {
          return { data, error: null, source: 'storage' }
        }
      }
    } catch {
      // RPC fallback below
    }
  }

  if (!supabase) {
    return {
      data: null,
      error: new Error('Supabase 환경변수가 비어 있습니다.'),
      source: null,
    }
  }

  const { data, error } = await supabase.rpc('get_attendance_leaderboard')
  return { data, error, source: 'rpc' }
}

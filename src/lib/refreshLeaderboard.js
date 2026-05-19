export const LEADERBOARD_UPDATED_EVENT = 'leaderboard-updated'

/** 순위 Storage JSON 갱신 (Edge Function). 실패해도 RPC 병합으로 순위는 표시됩니다. */
export async function refreshLeaderboardCache(supabase) {
  if (!supabase) return false

  try {
    const { data, error } = await supabase.functions.invoke('sync-leaderboard', {
      method: 'POST',
      body: {},
    })
    if (error) throw error
    if (data?.ok === false) {
      throw new Error(data.error || 'sync-leaderboard failed')
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(LEADERBOARD_UPDATED_EVENT))
    }
    return true
  } catch (err) {
    console.warn('[leaderboard] refresh skipped:', err?.message ?? err)
    return false
  }
}

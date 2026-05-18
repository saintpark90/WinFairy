const KAKAO_AVATAR_SIZES = [64, 110, 160, 240, 320, 480, 640]

/**
 * 큰 원본 프로필 URL을 표시 크기에 맞는 해상도로 요청합니다 (카카오 CDN img_NxN 등).
 * @param {string} url
 * @param {number} displaySizePx 화면에 보이는 한 변(px). 레티나용 2배 해상도를 요청합니다.
 */
export function optimizeAvatarUrl(url, displaySizePx = 40) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''

  const targetPx = Math.max(Math.round(displaySizePx * 2), 80)
  const pickPreset = () =>
    KAKAO_AVATAR_SIZES.find((size) => size >= targetPx) ??
    KAKAO_AVATAR_SIZES[KAKAO_AVATAR_SIZES.length - 1]

  const kakaoReplaced = trimmed.replace(
    /img_(\d+)x(\d+)(q\d+)?/i,
    (_match, _w, _h, qualitySuffix = '') => {
      const preset = pickPreset()
      return `img_${preset}x${preset}${qualitySuffix}`
    },
  )
  if (kakaoReplaced !== trimmed) return kakaoReplaced

  if (/googleusercontent\.com/i.test(trimmed)) {
    return trimmed.replace(/=s\d+(-c)?/i, `=s${targetPx}$1`)
  }

  return trimmed
}

export function getUserDisplayFields(user) {
  if (!user) {
    return { displayName: '회원', avatarUrl: '' }
  }

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.nickname ||
    user.user_metadata?.preferred_username ||
    user.email?.split('@')[0] ||
    '회원'

  const avatarUrl =
    user.user_metadata?.avatar_url || user.user_metadata?.picture || ''

  return {
    displayName,
    avatarUrl,
  }
}

/** auth.users UUID만 프로필 DB와 호환됩니다 */
export function isAuthUserUuid(id) {
  if (typeof id !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  )
}

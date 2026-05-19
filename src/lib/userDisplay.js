const KAKAO_AVATAR_SIZES = [64, 110, 160, 240, 320, 480, 640]

/** HTTPS 페이지에서 카카오 등 http 프로필 URL이 차단되지 않도록 보정 */
const secureAvatarUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    /^http:\/\//i.test(trimmed)
  ) {
    return trimmed.replace(/^http:\/\//i, 'https://')
  }
  return trimmed
}

/**
 * 큰 원본 프로필 URL을 표시 크기에 맞는 해상도로 요청합니다 (카카오 CDN img_NxN 등).
 * @param {string} url
 * @param {number} displaySizePx 화면에 보이는 한 변(px). 레티나용 2배 해상도를 요청합니다.
 */
export function optimizeAvatarUrl(url, displaySizePx = 40) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = secureAvatarUrl(url)
  if (!trimmed) return ''

  const targetPx = Math.max(Math.round(displaySizePx * 2), 80)
  const pickPreset = () =>
    KAKAO_AVATAR_SIZES.find((size) => size >= targetPx) ??
    KAKAO_AVATAR_SIZES[KAKAO_AVATAR_SIZES.length - 1]

  const kakaoReplaced = trimmed.replace(
    /img_(\d+)x(\d+)(q\d+)?/i,
    (_match, w, h, qualitySuffix = '') => {
      const originalMax = Math.max(parseInt(w, 10) || 0, parseInt(h, 10) || 0)
      let preset = pickPreset()
      // 카카오 CDN은 URL에 없는 더 큰 해상도(img_240 등) 요청 시 404가 날 수 있음
      if (originalMax > 0 && preset > originalMax) {
        const capped =
          [...KAKAO_AVATAR_SIZES].reverse().find((size) => size <= originalMax) ??
          originalMax
        preset = capped
      }
      return `img_${preset}x${preset}${qualitySuffix}`
    },
  )
  if (kakaoReplaced !== trimmed) return kakaoReplaced

  if (/googleusercontent\.com/i.test(trimmed)) {
    return trimmed.replace(/=s\d+(-c)?/i, `=s${targetPx}$1`)
  }

  return trimmed
}

const readIdentityAvatar = (user) => {
  const identities = user?.identities
  if (!Array.isArray(identities)) return ''
  for (const identity of identities) {
    const data = identity?.identity_data
    if (!data || typeof data !== 'object') continue
    const url =
      data.avatar_url ||
      data.picture ||
      data.profile_image ||
      data.profile_image_url ||
      data.photo_url
    if (typeof url === 'string' && url.trim()) return url.trim()
  }
  return ''
}

export function getUserDisplayFields(user) {
  if (!user) {
    return { displayName: '회원', avatarUrl: '' }
  }

  const meta = user.user_metadata ?? {}

  const displayName =
    meta.full_name ||
    meta.name ||
    meta.nickname ||
    meta.preferred_username ||
    user.email?.split('@')[0] ||
    '회원'

  const avatarUrl =
    meta.avatar_url ||
    meta.picture ||
    meta.profile_image ||
    meta.profile_image_url ||
    meta.photo_url ||
    readIdentityAvatar(user) ||
    ''

  return {
    displayName,
    avatarUrl: secureAvatarUrl(avatarUrl),
  }
}

/** HTTPS 보정만 적용 (리사이즈 없음) — optimize 실패 시 폴백용 */
export function normalizeAvatarUrl(url) {
  return secureAvatarUrl(url)
}

/** 세션 메타데이터 + profiles 테이블 avatar_url 병합 */
export function resolveAvatarUrl(user, profileRow) {
  const fromSession = getUserDisplayFields(user).avatarUrl
  const fromProfile =
    typeof profileRow?.avatar_url === 'string' ? secureAvatarUrl(profileRow.avatar_url) : ''
  return fromProfile || fromSession
}

/** auth.users UUID만 프로필 DB와 호환됩니다 */
export function isAuthUserUuid(id) {
  if (typeof id !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  )
}

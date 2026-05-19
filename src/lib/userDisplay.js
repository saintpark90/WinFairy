const KAKAO_AVATAR_SIZES = [64, 110, 160, 240, 320, 480, 640]

const readDevicePixelRatio = () => {
  if (typeof window === 'undefined') return 2
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), 3)
}

/** 표시 크기·DPR에 맞는 요청 해상도(px) */
const resolveAvatarRequestPx = (displaySizePx, options = {}) => {
  const dpr = options.devicePixelRatio ?? readDevicePixelRatio()
  const minPx = options.minRequestPx ?? Math.min(displaySizePx, 64)
  return Math.max(Math.round(displaySizePx * dpr), minPx)
}

const pickKakaoPreset = (targetPx, originalMax = 0) => {
  const ceiling =
    originalMax > 0
      ? ([...KAKAO_AVATAR_SIZES].reverse().find((size) => size <= originalMax) ?? originalMax)
      : (KAKAO_AVATAR_SIZES[KAKAO_AVATAR_SIZES.length - 1] ?? targetPx)

  const withinCeiling = KAKAO_AVATAR_SIZES.filter((size) => size <= ceiling)
  const atOrAbove = withinCeiling.find((size) => size >= targetPx)
  if (atOrAbove) return atOrAbove

  return withinCeiling[withinCeiling.length - 1] ?? ceiling
}

const resizeAvatarUrlToPx = (url, targetPx) => {
  const kakaoReplaced = url.replace(
    /img_(\d+)x(\d+)(q\d+)?/i,
    (_match, w, h, qualitySuffix = '') => {
      const originalMax = Math.max(parseInt(w, 10) || 0, parseInt(h, 10) || 0)
      const preset = pickKakaoPreset(targetPx, originalMax)
      return `img_${preset}x${preset}${qualitySuffix}`
    },
  )
  if (kakaoReplaced !== url) return kakaoReplaced

  if (/googleusercontent\.com/i.test(url)) {
    return url.replace(/=s\d+(-c)?/i, `=s${targetPx}$1`)
  }

  return url
}

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
 * @param {number} displaySizePx 화면에 보이는 한 변(px)
 * @param {object} [options]
 * @param {number} [options.devicePixelRatio] 요청 배율 (기본: 기기 DPR, 최대 3)
 * @param {number} [options.minRequestPx] 최소 요청 한 변(px). 기본은 displaySizePx와 64px 중 작은 값
 */
export function optimizeAvatarUrl(url, displaySizePx = 40, options = {}) {
  if (!url || typeof url !== 'string') return ''
  const trimmed = secureAvatarUrl(url)
  if (!trimmed) return ''

  const targetPx = resolveAvatarRequestPx(displaySizePx, options)
  return resizeAvatarUrlToPx(trimmed, targetPx)
}

/**
 * 표시 크기에 맞는 1x·2x·3x srcSet 문자열 (과도한 원본 다운스케일 방지)
 * @param {string} url
 * @param {number} displaySizePx
 * @returns {{ src: string, srcSet: string }}
 */
export function buildAvatarSrcSet(url, displaySizePx) {
  if (!url || typeof url !== 'string') {
    return { src: '', srcSet: '' }
  }

  const densities = [1, 2, 3]
  const seen = new Set()
  const parts = []

  for (const dpr of densities) {
    const candidate = optimizeAvatarUrl(url, displaySizePx, {
      devicePixelRatio: dpr,
      minRequestPx: displaySizePx,
    })
    if (!candidate || seen.has(candidate)) continue
    seen.add(candidate)
    parts.push(`${candidate} ${dpr}x`)
  }

  const src =
    optimizeAvatarUrl(url, displaySizePx, {
      devicePixelRatio: 1,
      minRequestPx: displaySizePx,
    }) || parts[0]?.split(' ')[0] || ''

  return { src, srcSet: parts.join(', ') }
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

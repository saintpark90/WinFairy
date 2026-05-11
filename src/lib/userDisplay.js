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

/** 슈퍼관리자 (관리자 지정·해제는 이 계정만 가능) */
export const SUPER_ADMIN_EMAIL = 'palk876@kakao.com'

/** @deprecated SUPER_ADMIN_EMAIL 사용 */
export const ADMIN_EMAIL = SUPER_ADMIN_EMAIL

export const BLOCKED_LOGIN_MESSAGE =
  '계정이 차단되었습니다. 관리자에게 문의해 주세요.'

export function isSuperAdminUser(user) {
  const email = user?.email?.trim().toLowerCase() ?? ''
  return email === SUPER_ADMIN_EMAIL.toLowerCase()
}

/** 회원 관리 UI 표시 여부 (슈퍼관리자 또는 is_admin 프로필) */
export function canAccessMemberAdmin(user, profileRow) {
  if (isSuperAdminUser(user)) return true
  return Boolean(profileRow?.is_admin)
}

/** @deprecated canAccessMemberAdmin 사용 */
export function isAdminUser(user, profileRow) {
  return canAccessMemberAdmin(user, profileRow)
}

export function isMemberAdminRow(member) {
  return Boolean(member?.is_super_admin || member?.is_admin)
}

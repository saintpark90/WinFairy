/** 관리자로 지정된 계정 이메일 (소문자 비교) */
export const ADMIN_EMAIL = 'palk876@kakao.com'

export const BLOCKED_LOGIN_MESSAGE =
  '계정이 차단되었습니다. 관리자에게 문의해 주세요.'

export function isAdminUser(user) {
  const email = user?.email?.trim().toLowerCase() ?? ''
  return email === ADMIN_EMAIL.toLowerCase()
}

/** 관리자로 지정된 계정 이메일 (소문자 비교) */
export const ADMIN_EMAIL = 'palk876@kakao.com'

export function isAdminUser(user) {
  const email = user?.email?.trim().toLowerCase() ?? ''
  return email === ADMIN_EMAIL.toLowerCase()
}

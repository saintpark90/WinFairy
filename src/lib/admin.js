/** 앱 관리자(순위 페이지 회원 삭제 등). 서버 RPC에서도 동일 이메일로 검증합니다. */
export const ADMIN_EMAIL = 'palk876@kakao.com'

export function isAdminUser(user) {
  const email = user?.email?.trim().toLowerCase()
  return email === ADMIN_EMAIL.toLowerCase()
}

/** KBO 구장명 → 2글자 표기 (잠실, 고척, 사직 등) */
const STADIUM_KEYWORDS = [
  '잠실',
  '고척',
  '문학',
  '수원',
  '대구',
  '사직',
  '광주',
  '대전',
  '창원',
]

/**
 * @param {string | null | undefined} stadium
 * @returns {string} 2글자 약칭 또는 '–'
 */
export function formatStadiumShort(stadium) {
  const raw = stadium != null ? String(stadium).trim() : ''
  if (!raw || raw === '미정' || raw === '미상') return '–'

  for (const keyword of STADIUM_KEYWORDS) {
    if (raw.includes(keyword)) return keyword
  }

  if (raw.length <= 2) return raw
  return raw.slice(0, 2)
}

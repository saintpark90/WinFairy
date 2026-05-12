/**
 * KBO 공식 사이트(https://www.koreabaseball.com/) 메인 `div.kbo-club`과 동일한 엠블럼 CDN.
 * 경로: …/KBO_IMAGE/KBOHome/resources/images/emblem/regular/{연도}/{팀코드}.png
 * 로딩 실패 시 img 숨김은 HomePage `onError`에서 처리.
 */
const KBO_EMBLEM_BASE =
  'https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/KBOHome/resources/images/emblem/regular'

/** @type {readonly [string, string][]} 키는 `opponent_team` 문자열에 부분 일치로 매칭 */
const TEAM_LOGO_ENTRIES = [
  ['LG', `${KBO_EMBLEM_BASE}/2022/LG.png`],
  ['두산', `${KBO_EMBLEM_BASE}/2025/OB.png`],
  ['KIA', `${KBO_EMBLEM_BASE}/2022/HT.png`],
  ['롯데', `${KBO_EMBLEM_BASE}/2022/LT.png`],
  ['삼성', `${KBO_EMBLEM_BASE}/2022/SS.png`],
  ['키움', `${KBO_EMBLEM_BASE}/2022/WO.png`],
  ['SSG', `${KBO_EMBLEM_BASE}/2024/SK.png`],
  ['KT', `${KBO_EMBLEM_BASE}/2022/KT.png`],
  ['NC', `${KBO_EMBLEM_BASE}/2022/NC.png`],
  ['한화', `${KBO_EMBLEM_BASE}/2025/HH.png`],
]

export function getOpponentTeamLogoUrl(label) {
  if (!label || label === '미상') return null
  for (const [key, url] of TEAM_LOGO_ENTRIES) {
    if (label.includes(key)) return url
  }
  return null
}

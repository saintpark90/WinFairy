/**
 * 관공서의 공휴일(법정 공휴일), 국경일에 관한 법률상 국경일(공휴일이 아닌 날 포함),
 * 그 밖의 국가기념일(예: 6·25전쟁일)을 구분해 달력에 표기합니다.
 * 대체공휴일·음력절기는 정부 고시·연도별로 수동 보완합니다.
 *
 * @typedef {'public' | 'both' | 'national' | 'memorial' | 'observance'} KoreanDayMarkKind
 * - public: 법정 공휴일(관공서의 공휴일에 관한 규정)
 * - both: 법정 공휴일이면서 국경일법상 국경일(삼일절·광복절·개천절·한글날)
 * - national: 국경일이나 해당일은 공휴일이 아님(제헌절)
 * - memorial: 국경일도 아닌 국가기념·추모일(6·25 전쟁일 등) — 빨간날(공휴일) 스타일 없음
 * - observance: 국제·관습 기념일(노동절 등) — 법정 공휴일 아님, 빨간날 스타일 없음
 */

/** @type {Record<string, { kind: KoreanDayMarkKind, label: string }>} */
const KOREAN_DAY_MARKS = {
  '2025-01-01': { kind: 'public', label: '신정' },
  '2025-01-28': { kind: 'public', label: '설날' },
  '2025-01-29': { kind: 'public', label: '설날' },
  '2025-01-30': { kind: 'public', label: '설날' },
  '2025-03-01': { kind: 'both', label: '삼일절' },
  '2025-03-03': { kind: 'public', label: '대체공휴일' },
  '2025-05-01': { kind: 'observance', label: '노동절' },
  '2025-05-05': { kind: 'public', label: '어린이날·부처님오신날' },
  '2025-05-06': { kind: 'public', label: '대체공휴일' },
  '2025-06-06': { kind: 'public', label: '현충일' },
  '2025-06-25': { kind: 'memorial', label: '6·25 전쟁일' },
  '2025-07-17': { kind: 'public', label: '제헌절' },
  '2025-08-15': { kind: 'both', label: '광복절' },
  '2025-10-03': { kind: 'both', label: '개천절' },
  '2025-10-05': { kind: 'public', label: '추석' },
  '2025-10-06': { kind: 'public', label: '추석' },
  '2025-10-07': { kind: 'public', label: '추석' },
  '2025-10-08': { kind: 'public', label: '대체공휴일' },
  '2025-10-09': { kind: 'both', label: '한글날' },
  '2025-12-25': { kind: 'public', label: '성탄절' },

  '2026-01-01': { kind: 'public', label: '신정' },
  '2026-02-16': { kind: 'public', label: '설날' },
  '2026-02-17': { kind: 'public', label: '설날' },
  '2026-02-18': { kind: 'public', label: '설날' },
  '2026-03-01': { kind: 'both', label: '삼일절' },
  '2026-03-02': { kind: 'public', label: '대체공휴일' },
  '2026-05-01': { kind: 'observance', label: '노동절' },
  '2026-05-05': { kind: 'public', label: '어린이날' },
  '2026-05-24': { kind: 'public', label: '부처님오신날' },
  '2026-05-25': { kind: 'public', label: '대체공휴일' },
  '2026-06-06': { kind: 'public', label: '현충일' },
  '2026-06-25': { kind: 'memorial', label: '6·25 전쟁일' },
  '2026-07-17': { kind: 'public', label: '제헌절' },
  '2026-08-15': { kind: 'both', label: '광복절' },
  '2026-08-17': { kind: 'public', label: '대체공휴일' },
  '2026-09-24': { kind: 'public', label: '추석' },
  '2026-09-25': { kind: 'public', label: '추석' },
  '2026-09-26': { kind: 'public', label: '추석' },
  '2026-09-28': { kind: 'public', label: '대체공휴일' },
  '2026-10-03': { kind: 'both', label: '개천절' },
  '2026-10-05': { kind: 'public', label: '대체공휴일' },
  '2026-10-09': { kind: 'both', label: '한글날' },
  '2026-12-25': { kind: 'public', label: '성탄절' },

  '2027-01-01': { kind: 'public', label: '신정' },
  '2027-02-06': { kind: 'public', label: '설날' },
  '2027-02-07': { kind: 'public', label: '설날' },
  '2027-02-08': { kind: 'public', label: '설날' },
  '2027-02-09': { kind: 'public', label: '대체공휴일' },
  '2027-03-01': { kind: 'both', label: '삼일절' },
  '2027-05-01': { kind: 'observance', label: '노동절' },
  '2027-05-05': { kind: 'public', label: '어린이날' },
  '2027-05-13': { kind: 'public', label: '부처님오신날' },
  '2027-05-14': { kind: 'public', label: '대체공휴일' },
  '2027-06-06': { kind: 'public', label: '현충일' },
  '2027-06-25': { kind: 'memorial', label: '6·25 전쟁일' },
  '2027-07-17': { kind: 'public', label: '제헌절' },
  '2027-08-15': { kind: 'both', label: '광복절' },
  '2027-08-16': { kind: 'public', label: '대체공휴일' },
  '2027-09-14': { kind: 'public', label: '추석' },
  '2027-09-15': { kind: 'public', label: '추석' },
  '2027-09-16': { kind: 'public', label: '추석' },
  '2027-10-03': { kind: 'both', label: '개천절' },
  '2027-10-04': { kind: 'public', label: '대체공휴일' },
  '2027-10-09': { kind: 'both', label: '한글날' },
  '2027-10-11': { kind: 'public', label: '대체공휴일' },
  '2027-12-25': { kind: 'public', label: '성탄절' },
}

/**
 * @param {KoreanDayMarkKind} kind
 * @param {string} label
 */
function buildCaption(kind, label) {
  if (kind === 'public') return `${label}`
  if (kind === 'both') return `${label}`
  if (kind === 'national') return `${label}`
  if (kind === 'observance') return `5·1 ${label}`
  return `${label}`
}

/**
 * @param {string} isoDate `YYYY-MM-DD`
 * @returns {{ kind: KoreanDayMarkKind, label: string, caption: string } | null}
 */
export function getKoreanDayMark(isoDate) {
  const row = KOREAN_DAY_MARKS[isoDate]
  if (!row) return null
  return {
    kind: row.kind,
    label: row.label,
    caption: buildCaption(row.kind, row.label),
  }
}

/** @param {string} isoDate `YYYY-MM-DD` — 하위 호환: 캡션 문자열만 필요할 때 */
export function getKoreanHolidayLabel(isoDate) {
  return getKoreanDayMark(isoDate)?.caption ?? null
}

/** 공휴일(또는 공휴일 겸 국경일) 여부 — 달력 빨간날 스타일용 */
export function isKoreanPublicHolidayMark(mark) {
  return mark?.kind === 'public' || mark?.kind === 'both'
}

/** 국경일(공휴일 아님)·기념일·노동절 등 — 빨간날이 아닌 구분 스타일용 */
export function isKoreanNonRedDayMark(mark) {
  return (
    mark?.kind === 'national' || mark?.kind === 'memorial' || mark?.kind === 'observance'
  )
}

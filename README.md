# 승요 이글스

한화 이글스 직관 승률을 자동 집계하는 웹앱입니다.  
GitHub Pages + Supabase + Kakao OAuth 조합으로 동작합니다.

## 1) 환경 변수

`.env.example`을 복사해 `.env` 생성:

```bash
cp .env.example .env
```

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BASE_PATH` (GitHub Pages 저장소 경로, 예: `/seungyo-eagles/`)

## 2) Supabase 설정

1. Supabase 프로젝트 생성
2. `supabase/schema.sql` 실행
3. Authentication > Providers > Kakao 활성화
4. Kakao Developers에서 앱 생성 후 REST API 키/Secret 등록
5. Redirect URL 등록:
   - `http://localhost:5173`
   - `https://<github-id>.github.io/<repo>/`

## 3) 2026 경기 데이터 적재

`matches` 테이블에 2026 시즌 한화 경기 데이터를 입력합니다.

```bash
cd scripts
pip install -r requirements.txt
set SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
set TARGET_SEASON=2026
python fetch_kbo_2026.py
```

> 참고: KBO 응답 포맷은 시점별로 바뀔 수 있으니 `fetch_kbo_2026.py`의
> `fetch_schedule`, `normalize_match` 필드 매핑은 실제 응답 기준으로 1회 점검하세요.

## 4) 로컬 실행

```bash
npm install
npm run dev
```

## 5) GitHub Pages 배포

권장: GitHub Actions로 `dist` 자동 배포.

1. 저장소 Settings > Pages > Source를 "GitHub Actions"로 선택
2. Vite 빌드(`npm run build`) 후 `dist`를 Pages에 publish하는 워크플로우 추가
3. 배포 URL을 Kakao Redirect URL에도 추가

## 구현된 기능

- 카카오 OAuth 전용 로그인 (미로그인 시 자동 리디렉션)
- 상단 메뉴: `홈`, `직관일 입력`
- 직관일 입력: 날짜만 선택하면 `matches`와 연결해 저장
- 홈 통계:
  - 전체 승률
  - 경기장별 승률
  - 홈/원정 승률
  - 평일/주말 승률
  - 상대팀별 승률
  - 직관일 기준 한화 타자/투수 TOP5

# 승요 이글스

한화 이글스 직관 승률을 자동 집계하는 웹앱입니다.  
**Vercel**([winfairy.vercel.app](https://winfairy.vercel.app)) · GitHub Pages · Supabase · Kakao OAuth 조합으로 동작합니다.

## 1) 환경 변수

`.env.example`을 참고해 로컬 전용 파일을 만듭니다. **실제 키 값은 Git에 커밋하지 마세요.**

- **로컬 개발**: 프로젝트 루트에 `.env.local`을 두면 Vite가 자동으로 읽습니다.  
  `.gitignore`에 의해 **저장소에 포함되지 않으므로** 운영 배포와 무관합니다.
- **GitHub Pages 빌드**: `Deploy to GitHub Pages` 워크플로우가 **Actions secrets**의  
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`와 `VITE_BASE_PATH=/WinFairy/`를 주입합니다.
- **Vercel 빌드**: 프로젝트 **Environment Variables**에 동일한 `VITE_*` 키를 등록합니다.  
  `VITE_BASE_PATH`는 `vercel.json`에서 `/`로 설정되어 있습니다(루트 도메인 배포).

예시(로컬):

```bash
cp .env.example .env.local
```

필요한 변수:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BASE_PATH` — Vercel·로컬: `/`, GitHub Pages: `/WinFairy/`
- Python 스크립트용(선택): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 2) Supabase 설정

1. Supabase 프로젝트 생성
2. `supabase/schema.sql` 실행 (이미 운영 중인 DB에는 `supabase/membership_leaderboard.sql`만 추가 실행해도 됩니다)
3. Authentication > Providers > Kakao 활성화
4. Kakao Developers에서 앱 생성 후 REST API 키/Secret 등록
5. Redirect URL 등록 (Authentication > URL Configuration):
   - Site URL: `https://winfairy.vercel.app`
   - Redirect URLs:
     - `http://localhost:5173/**`
     - `https://winfairy.vercel.app/**`
     - `https://<github-id>.github.io/WinFairy/**` (GitHub Pages 사용 시)

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

## 3-1) 경기결과 자동 수집 (하루 1회)

`Sync KBO Regular Season Results` GitHub Actions 워크플로우가 매일 1회 실행되어
KBO 정규시즌 결과를 `matches` 테이블에 upsert 합니다. 이때 `player_stats`에는
KBO 일별 경기 요약(선발·승·패·세이브·주요 타자 등)을 한화 기준으로 채워 넣어,
직관일 통계 화면의 TOP5 집계에 사용합니다.

GitHub 저장소의 Actions secrets에 아래 키를 등록하세요.

- `SUPABASE_URL`: `https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: service role key

워크플로우 수동 실행은 Actions 탭에서 `workflow_dispatch`로 가능합니다.

## 4) 로컬 실행

```bash
npm install
npm run dev
```

## 5) Vercel 배포 (winfairy.vercel.app)

저장소 루트의 `vercel.json`이 Vite 빌드·SPA 라우팅·`VITE_BASE_PATH=/`를 설정합니다.

1. [Vercel](https://vercel.com) 로그인 → **Add New Project** → GitHub `WinFairy` 저장소 Import
2. **Project Name**을 `winfairy`로 설정 → 배포 URL이 `https://winfairy.vercel.app`이 됩니다
3. **Environment Variables** (Production·Preview·Development 모두):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_BASE_PATH`는 **설정하지 마세요** (또는 `/`만). `/WinFairy/`로 두면 JS가 로드되지 않습니다.  
     Vercel 빌드 시 `vite.config.js`가 `VERCEL=1`이면 자동으로 `/`를 씁니다.
4. Deploy 후 Supabase·Kakao Redirect URL에 `https://winfairy.vercel.app` 반영 (위 2)절)

CLI로 배포할 때:

```bash
npm i -g vercel
vercel login
vercel link   # 프로젝트 이름: winfairy
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

## 6) GitHub Pages 배포

권장: GitHub Actions로 `dist` 자동 배포.

1. 저장소 Settings > Pages > Source를 "GitHub Actions"로 선택
2. Actions secrets에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록
3. 배포 URL: `https://<github-id>.github.io/WinFairy/`

## 구현된 기능

- 카카오 OAuth 전용 로그인 (미로그인 시 자동 리디렉션)
- 로그인 시 `profiles`에 회원 정보 동기화, 직관 승률 **순위** 화면
- 상단 메뉴: `내 정보`, `순위`, `직관일 입력`
- 직관일 입력: 날짜만 선택하면 `matches`와 연결해 저장
- 직관일 입력: 날짜 입력 + 경기결과 달력 클릭 선택
- 홈 통계:
  - 전체 승률
  - 경기장별 승률
  - 홈/원정 승률
  - 평일/주말 승률
  - 상대팀별 승률
  - 직관일 기준 한화 타자/투수 TOP5

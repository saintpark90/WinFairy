-- 경기 예정 시작 시각 (KBO 일정 G_TM). 직관 달력 등에서 경기 전 표시에 사용.
alter table public.matches
  add column if not exists game_start_time text;

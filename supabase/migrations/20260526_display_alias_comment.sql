-- 순위 UI는 display_name만 사용; display_alias는 관리·내부 참고용
comment on column public.profiles.display_alias is
  '관리·내부 참고용 별명. 순위 화면에는 display_name(카카오 닉네임)만 표시.';

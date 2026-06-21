"""Supabase Edge Function 배포 (SUPABASE_ACCESS_TOKEN 필요).

토큰 발급: https://supabase.com/dashboard/account/tokens
.env.local 예: SUPABASE_ACCESS_TOKEN=sbp_...
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

from fetch_kbo_2026 import _load_local_env

PROJECT_REF = "pxienajdgtrzbfdiwbsh"
DEFAULT_FUNCTION_NAMES = ("sync-leaderboard", "refresh-match-results")


def _read_access_token() -> str:
  _load_local_env()
  token = os.getenv("SUPABASE_ACCESS_TOKEN")
  if token:
    return token

  env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
  if os.path.isfile(env_path):
    with open(env_path, encoding="utf-8") as handle:
      for line in handle:
        line = line.strip()
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
          return line.partition("=")[2].strip().strip('"').strip("'")

  return ""


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Deploy Supabase Edge Functions.")
  parser.add_argument(
    "functions",
    nargs="*",
    choices=DEFAULT_FUNCTION_NAMES,
    help="배포할 함수명. 생략하면 모든 Edge Function을 배포합니다.",
  )
  return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
  args = _parse_args(argv)
  token = _read_access_token()
  if not token:
    print(
      "SUPABASE_ACCESS_TOKEN 환경 변수가 필요합니다.\n"
      "Supabase Dashboard > Account > Access Tokens 에서 발급 후 .env.local 에 추가하세요.",
      file=sys.stderr,
    )
    sys.exit(1)

  function_names = args.functions or list(DEFAULT_FUNCTION_NAMES)
  root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
  env = {**os.environ, "SUPABASE_ACCESS_TOKEN": token}

  for function_name in function_names:
    result = subprocess.run(
      [
        "npx",
        "--yes",
        "supabase",
        "functions",
        "deploy",
        function_name,
        "--project-ref",
        PROJECT_REF,
        "--use-api",
      ],
      cwd=root,
      env=env,
      check=False,
    )
    if result.returncode != 0:
      sys.exit(result.returncode)

    print(f"Deployed: {function_name} -> project {PROJECT_REF}")


if __name__ == "__main__":
  main()

"""Supabase Edge Function 배포 (SUPABASE_ACCESS_TOKEN 필요).

토큰 발급: https://supabase.com/dashboard/account/tokens
.env.local 예: SUPABASE_ACCESS_TOKEN=sbp_...
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

from fetch_kbo_2026 import _load_local_env, require_env

PROJECT_REF = "pxienajdgtrzbfdiwbsh"
FUNCTION_NAME = "sync-leaderboard"


def main() -> None:
  _load_local_env()
  token = os.getenv("SUPABASE_ACCESS_TOKEN")
  if not token:
    print(
      "SUPABASE_ACCESS_TOKEN 환경 변수가 필요합니다.\n"
      "Supabase Dashboard > Account > Access Tokens 에서 발급 후 .env.local 에 추가하세요.",
      file=sys.stderr,
    )
    sys.exit(1)

  require_env("SUPABASE_URL")
  root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
  env = {**os.environ, "SUPABASE_ACCESS_TOKEN": token}

  result = subprocess.run(
    [
      "npx",
      "--yes",
      "supabase",
      "functions",
      "deploy",
      FUNCTION_NAME,
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

  print(f"Deployed: {FUNCTION_NAME} -> project {PROJECT_REF}")


if __name__ == "__main__":
  main()

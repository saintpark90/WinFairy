"""Debug attendance rows for a display name (service role)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = ROOT / ".env.local"
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def main() -> None:
    name = sys.argv[1] if len(sys.argv) > 1 else "지은"
    env = load_env()
    base = env.get("SUPABASE_URL") or env.get("VITE_SUPABASE_URL")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    pattern = f"*{name}*"
    profiles_resp = requests.get(
        f"{base}/rest/v1/profiles",
        headers=headers,
        params={"select": "id,display_name", "display_name": f"ilike.{pattern}"},
        timeout=30,
    )
    profiles_resp.raise_for_status()
    profiles = profiles_resp.json()
    print(json.dumps({"profiles": profiles}, ensure_ascii=False, indent=2))

    select = (
        "attended_at,match_id,"
        "matches(id,game_date,game_status,winner_team,hanwha_score,opponent_score,opponent_team,game_start_time)"
    )
    for profile in profiles:
        uid = profile["id"]
        att_resp = requests.get(
            f"{base}/rest/v1/user_attendance",
            headers=headers,
            params={
                "user_id": f"eq.{uid}",
                "select": select,
                "order": "attended_at.asc",
            },
            timeout=30,
        )
        att_resp.raise_for_status()
        rows = att_resp.json()
        print(
            json.dumps(
                {"user": profile["display_name"], "attendance": rows},
                ensure_ascii=False,
                indent=2,
            ),
        )


if __name__ == "__main__":
    main()

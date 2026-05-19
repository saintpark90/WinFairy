import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 순위 Storage JSON 갱신 (가입·직관 저장 시 클라이언트에서 호출)

const HANWHA = "한화";
const BUCKET = "public-data";
const OBJECT_PATH = "leaderboard.json";
const CANCELLED_RE = /취소|노게임|무효|제외/;

type MatchRow = {
  winner_team?: string | null;
  game_status?: string | null;
  hanwha_score?: number | null;
  opponent_score?: number | null;
};

type AttendanceRow = {
  user_id: string;
  matches?: MatchRow | null;
};

type ProfileRow = {
  id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_blocked?: boolean | null;
};

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function isMatchCancelled(match: MatchRow | null | undefined) {
  if (!match?.game_status) return false;
  return CANCELLED_RE.test(String(match.game_status));
}

function isMatchDecided(match: MatchRow | null | undefined) {
  if (!match || isMatchCancelled(match)) return false;
  const winner = match.winner_team;
  if (winner != null && String(winner).trim() !== "") return true;
  return (
    typeof match.hanwha_score === "number" &&
    typeof match.opponent_score === "number"
  );
}

function isDraw(match: MatchRow | null | undefined) {
  if (!isMatchDecided(match) || !match) return false;
  if (
    typeof match.hanwha_score === "number" &&
    typeof match.opponent_score === "number"
  ) {
    return match.hanwha_score === match.opponent_score;
  }
  return String(match.winner_team ?? "").includes("무");
}

function isHanwhaWin(match: MatchRow | null | undefined) {
  if (!isMatchDecided(match) || isDraw(match) || !match?.winner_team) {
    return false;
  }
  return String(match.winner_team).includes(HANWHA);
}

function isHanwhaLoss(match: MatchRow | null | undefined) {
  return isMatchDecided(match) && !isHanwhaWin(match) && !isDraw(match);
}

async function fetchAll<T>(
  admin: ReturnType<typeof createClient>,
  table: string,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await admin
      .from(table)
      .select(select)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function buildLeaderboardRows(
  profiles: ProfileRow[],
  attendance: AttendanceRow[],
): LeaderboardRow[] {
  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const statsByUser = new Map<
    string,
    {
      games: number;
      wins: number;
      losses: number;
      draws: number;
      winRateDenominator: number;
    }
  >();

  for (const row of attendance) {
    const match = row.matches ?? null;
    if (!isMatchDecided(match)) continue;

    const profile = profileById.get(row.user_id);
    if (profile?.is_blocked) continue;

    const bucket = statsByUser.get(row.user_id) ?? {
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRateDenominator: 0,
    };

    bucket.games += 1;
    if (match?.winner_team && String(match.winner_team).trim()) {
      bucket.winRateDenominator += 1;
    }
    if (isHanwhaWin(match)) bucket.wins += 1;
    else if (isHanwhaLoss(match)) bucket.losses += 1;
    else if (isDraw(match)) bucket.draws += 1;

    statsByUser.set(row.user_id, bucket);
  }

  const rows: LeaderboardRow[] = [];
  for (const [userId, stats] of statsByUser) {
    if (stats.games <= 0) continue;
    const profile = profileById.get(userId);
    if (profile?.is_blocked) continue;
    const displayName = (profile?.display_name ?? "").trim() || "회원";
    const winRate =
      stats.winRateDenominator > 0
        ? Math.round((1000 * stats.wins) / stats.winRateDenominator) / 10
        : 0;

    rows.push({
      user_id: userId,
      display_name: displayName,
      avatar_url: profile?.avatar_url ?? null,
      games: stats.games,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      win_rate: winRate,
    });
  }

  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.games - a.games ||
      a.display_name.localeCompare(b.display_name, "ko"),
  );

  return rows;
}

async function ensurePublicBucket(admin: ReturnType<typeof createClient>) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw error;
  if (buckets?.some((bucket) => bucket.name === BUCKET || bucket.id === BUCKET)) {
    return;
  }
  const { error: createError } = await admin.storage.createBucket(BUCKET, {
    public: true,
  });
  if (createError && !String(createError.message).includes("already exists")) {
    throw createError;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const [profiles, attendance] = await Promise.all([
      fetchAll<ProfileRow>(admin, "profiles", "id,display_name,avatar_url,is_blocked"),
      fetchAll<AttendanceRow>(
        admin,
        "user_attendance",
        "user_id,match_id,attended_at,matches(*)",
      ),
    ]);

    const rows = buildLeaderboardRows(profiles, attendance);
    await ensurePublicBucket(admin);

    const payload = new Blob([JSON.stringify(rows)], {
      type: "application/json",
    });
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(OBJECT_PATH, payload, { upsert: true, contentType: "application/json" });

    if (uploadError) throw uploadError;

    return new Response(JSON.stringify({ ok: true, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

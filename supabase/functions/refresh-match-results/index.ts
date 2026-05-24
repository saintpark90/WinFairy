import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/** scripts/fetch_kbo_2026.py 와 동일한 Schedule.aspx 파싱 규칙 */
const PLAY_DECIDED_RE =
  /<span>([^<]+)<\/span><em><span class="(?:lose|win)">(\d+)<\/span><span>vs<\/span><span class="(?:lose|win)">(\d+)<\/span><\/em><span>([^<]+)<\/span>/;
const TIME_CELL_RE = /<b>([^<]+)<\/b>/;
const HANWHA_KEYWORDS = ["한화", "Eagles", "Hanwha"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripTags(html: string): string {
  return (html || "").replace(/<[^>]+>/g, "").trim();
}

function includesHanwha(label: string): boolean {
  const s = stripTags(label);
  return HANWHA_KEYWORDS.some((k) => s.includes(k));
}

type ParsedGame = {
  gameDate: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  gameStartTime: string | null;
  gameStatus: string | null;
};

function parseScheduleRow(block: { row?: unknown[] }, year: number): ParsedGame | null {
  const cells = block.row;
  if (!Array.isArray(cells) || cells.length < 8) return null;

  const dayText = String((cells[0] as { Text?: string })?.Text ?? "");
  const dm = dayText.match(/(\d{1,2})\.(\d{1,2})\(/);
  if (!dm) return null;

  const month = parseInt(dm[1], 10);
  const day = parseInt(dm[2], 10);
  const gameDate =
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const playHtml = String((cells[2] as { Text?: string })?.Text ?? "");
  const decided = playHtml.match(PLAY_DECIDED_RE);
  if (!decided) return null;

  const awayTeam = stripTags(decided[1]);
  const homeTeam = stripTags(decided[4]);
  if (!includesHanwha(awayTeam) && !includesHanwha(homeTeam)) return null;

  const awayScore = parseInt(decided[2], 10);
  const homeScore = parseInt(decided[3], 10);
  if (Number.isNaN(awayScore) || Number.isNaN(homeScore)) return null;

  const timeHtml = String((cells[1] as { Text?: string })?.Text ?? "");
  const tm = timeHtml.match(TIME_CELL_RE);
  const gameStartTime = tm ? stripTags(tm[1]) : null;

  const note = stripTags(String((cells[8] as { Text?: string })?.Text ?? ""));
  const gameStatus = note && note !== "-" ? note : null;

  return {
    gameDate,
    awayTeam,
    homeTeam,
    awayScore,
    homeScore,
    gameStartTime,
    gameStatus,
  };
}

function opponentMatches(dbName: string, parsedName: string): boolean {
  const a = stripTags(dbName);
  const b = stripTags(parsedName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

async function fetchScheduleMonth(
  year: number,
  month: number,
): Promise<{ row?: unknown[] }[]> {
  const url = "https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList";
  const params = new URLSearchParams({
    leId: "1",
    srIdList: "0,9,6",
    seasonId: String(year),
    gameMonth: String(month),
    teamId: "HH",
  });

  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.koreabaseball.com/Schedule/Schedule.aspx",
    Origin: "https://www.koreabaseball.com",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) return [];
  const json = await response.json();
  return Array.isArray(json.rows) ? json.rows : [];
}

async function fetchHanwhaScheduleRows(): Promise<{ row?: unknown[] }[]> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const current = await fetchScheduleMonth(year, month);
  if (month > 1) {
    const prev = await fetchScheduleMonth(year, month - 1);
    return [...prev, ...current];
  }
  return current;
}

async function updateMatchFromParsed(
  supabase: ReturnType<typeof createClient>,
  parsed: ParsedGame,
): Promise<boolean> {
  const isHome = includesHanwha(parsed.homeTeam);
  const isAway = includesHanwha(parsed.awayTeam);
  if (!isHome && !isAway) return false;

  const hanwhaScore = isHome ? parsed.homeScore : parsed.awayScore;
  const opponentScore = isHome ? parsed.awayScore : parsed.homeScore;
  const opponentFromKbo = isHome ? parsed.awayTeam : parsed.homeTeam;

  let winner: string | null = null;
  if (hanwhaScore > opponentScore) winner = "한화 이글스";
  else if (opponentScore > hanwhaScore) winner = opponentFromKbo;

  const { data: rows, error: selErr } = await supabase
    .from("matches")
    .select("id, opponent_team, home_away")
    .eq("game_date", parsed.gameDate);

  if (selErr || !rows?.length) return false;

  let match = rows[0];
  if (rows.length > 1) {
    const found = rows.find((r) =>
      opponentMatches(String(r.opponent_team), opponentFromKbo)
    );
    if (found) match = found;
  }

  const update: Record<string, unknown> = {
    hanwha_score: hanwhaScore,
    opponent_score: opponentScore,
    winner_team: winner,
    updated_at: new Date().toISOString(),
  };
  if (parsed.gameStartTime) update.game_start_time = parsed.gameStartTime;
  if (parsed.gameStatus) update.game_status = parsed.gameStatus;

  const { error } = await supabase.from("matches").update(update).eq("id", match.id);
  return !error;
}

async function syncMatchResults(
  supabase: ReturnType<typeof createClient>,
): Promise<{ updated: number; parsed: number }> {
  const blocks = await fetchHanwhaScheduleRows();
  const year = new Date().getFullYear();
  let updated = 0;
  let parsed = 0;

  for (const block of blocks) {
    const game = parseScheduleRow(block, year);
    if (!game) continue;
    parsed += 1;
    if (await updateMatchFromParsed(supabase, game)) updated += 1;
  }

  return { updated, parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { updated, parsed } = await syncMatchResults(supabase);

    return new Response(
      JSON.stringify({
        ok: true,
        updated,
        parsed,
        message: parsed === 0
          ? "KBO에서 종료된 한화 경기를 찾지 못했습니다."
          : `Updated ${updated} of ${parsed} finished games`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("refresh-match-results:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

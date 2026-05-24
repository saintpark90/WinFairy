import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MatchCell {
  Text?: string;
}

interface GameRow {
  game_date: string;
  opponent_team: string;
  home_away: string;
  hanwha_score?: number | null;
  opponent_score?: number | null;
  winner_team?: string | null;
  game_status?: string | null;
}

// 정규식
const PLAY_DECIDED_RE = /<span>([^<]+)<\/span><em><span class="(?:lose|win)">(\d+)<\/span><span>vs<\/span><span class="(?:lose|win)">(\d+)<\/span><\/em><span>([^<]+)<\/span>/g;
const PLAY_PENDING_RE = /<span>([^<]+)<\/span><em><span>vs<\/span><\/em><span>([^<]+)<\/span>/g;
const TIME_CELL_RE = /<b>([^<]+)<\/b>/;
const DAY_CELL_DATE_RE = /(\d{1,2})\.(\d{1,2})\(/;

const TEAM_ID_TO_NAME: Record<string, string> = {
  HH: "한화",
  OB: "두산",
  LG: "LG",
  LT: "롯데",
  HT: "KIA",
  SS: "삼성",
  WO: "키움",
  SK: "SSG",
  KT: "KT",
  NC: "NC",
};

function stripTags(html: string): string {
  return (html || "").replace(/<[^>]+>/g, "").trim();
}

function cleanCellText(value: any): string {
  const text = stripTags(String(value || ""));
  return text.replace(/&nbsp;/g, "").trim();
}

function dayCellToYYYYMMDD(dayText: string, year: number): string | null {
  const m = DAY_CELL_DATE_RE.exec(dayText || "");
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  try {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) return null; // 날짜 유효성 검사
    const y = d.getFullYear();
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mon}-${da}`;
  } catch {
    return null;
  }
}

function parseGameRow(cells: MatchCell[], year: number): GameRow | null {
  if (cells.length < 8) return null;

  const dayText = cells[0]?.Text || "";
  const gameDate = dayCellToYYYYMMDD(dayText, year);
  if (!gameDate) return null;

  const timeHtml = cells[1]?.Text || "";
  const timeMatch = TIME_CELL_RE.exec(timeHtml);
  const gameTime = timeMatch ? timeMatch[1].trim() : null;

  const playHtml = cells[2]?.Text || "";

  // 경기 결과 파싱 (승패 결정)
  let awayTeam = "";
  let homeTeam = "";
  let awayScore: number | null = null;
  let homeScore: number | null = null;

  PLAY_DECIDED_RE.lastIndex = 0;
  const decidedMatch = PLAY_DECIDED_RE.exec(playHtml);

  if (decidedMatch) {
    awayTeam = decidedMatch[1];
    awayScore = parseInt(decidedMatch[2], 10);
    homeScore = parseInt(decidedMatch[3], 10);
    homeTeam = decidedMatch[4];
  } else {
    // 경기 전 파싱
    PLAY_PENDING_RE.lastIndex = 0;
    const pendingMatch = PLAY_PENDING_RE.exec(playHtml);
    if (!pendingMatch) return null;
    awayTeam = pendingMatch[1];
    homeTeam = pendingMatch[2];
  }

  // 한화가 포함되어 있는지 확인
  const hanwhaInHome = homeTeam.includes("한화");
  const hanwhaInAway = awayTeam.includes("한화");

  if (!hanwhaInHome && !hanwhaInAway) return null;

  const homeAway = hanwhaInHome ? "HOME" : "AWAY";
  const opponentTeam = hanwhaInHome ? awayTeam : homeTeam;

  // 스코어 정규화
  let hanwhaScoreFinal: number | null = null;
  let opponentScoreFinal: number | null = null;

  if (awayScore !== null && homeScore !== null) {
    hanwhaScoreFinal = hanwhaInHome ? homeScore : awayScore;
    opponentScoreFinal = hanwhaInHome ? awayScore : homeScore;
  }

  // 승패 판단
  let winnerTeam: string | null = null;
  if (hanwhaScoreFinal !== null && opponentScoreFinal !== null) {
    if (hanwhaScoreFinal > opponentScoreFinal) {
      winnerTeam = "한화";
    } else if (opponentScoreFinal > hanwhaScoreFinal) {
      winnerTeam = opponentTeam;
    }
  }

  const stadiumRaw = cells[7]?.Text || "";
  const stadium = stripTags(stadiumRaw) || "미정";

  const noteRaw = cells[8]?.Text || "";
  const note = stripTags(noteRaw);
  const gameStatus = note && note !== "-" ? note : undefined;

  return {
    game_date: gameDate,
    opponent_team: opponentTeam,
    home_away: homeAway,
    hanwha_score: hanwhaScoreFinal,
    opponent_score: opponentScoreFinal,
    winner_team: winnerTeam,
    game_status: gameStatus,
  };
}

async function fetchScheduleFromKbo(): Promise<GameRow[]> {
  try {
    const baseUrl =
      "https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList";
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.koreabaseball.com/Schedule/Schedule.aspx",
      Origin: "https://www.koreabaseball.com",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const year = new Date().getFullYear();
    const srIdList = "0,9,6";
    const monthStart = 3;
    const monthEnd = 11;

    const games: GameRow[] = [];
    const seenGameIds = new Set<string>();

    for (let month = monthStart; month <= monthEnd; month++) {
      const params = new URLSearchParams({
        leId: "1",
        srIdList,
        seasonId: year.toString(),
        gameMonth: month.toString(),
        teamId: "HH",
      });

      const response = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: params.toString(),
      });

      if (!response.ok) {
        console.warn(`KBO API returned ${response.status} for month ${month}`);
        continue;
      }

      const json = await response.json();
      const rows = json.rows || [];

      for (const block of rows) {
        const cells = block.row;
        if (!Array.isArray(cells)) continue;

        const parsed = parseGameRow(cells, year);
        if (!parsed) continue;

        const gameId = `${parsed.game_date}_${parsed.opponent_team}_${parsed.home_away}`;
        if (seenGameIds.has(gameId)) continue;

        seenGameIds.add(gameId);
        games.push(parsed);
      }

      // 요청 간격 - 너무 빠르면 차단될 수 있음
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    return games;
  } catch (err) {
    console.error("KBO fetch error:", err);
    return [];
  }
}

async function updateMatches(
  supabase: any,
  games: GameRow[]
): Promise<number> {
  if (games.length === 0) {
    return 0;
  }

  let updated = 0;

  for (const game of games) {
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          hanwha_score: game.hanwha_score,
          opponent_score: game.opponent_score,
          winner_team: game.winner_team,
          game_status: game.game_status,
        })
        .eq("game_date", game.game_date)
        .eq("opponent_team", game.opponent_team);

      if (!error) {
        updated++;
      } else {
        console.warn(
          `Update failed for ${game.game_date} vs ${game.opponent_team}:`,
          error
        );
      }
    } catch (err) {
      console.error(
        `Update error for ${game.game_date} vs ${game.opponent_team}:`,
        err
      );
    }
  }

  return updated;
}

export async function handler(req: Request, _context: any) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log("Fetching latest games from KBO...");
    const games = await fetchScheduleFromKbo();

    if (games.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          updated: 0,
          message: "No games found to update",
        }),
        { headers: corsHeaders }
      );
    }

    console.log(`Found ${games.length} Hanwha games, updating...`);
    const updated = await updateMatches(supabase, games);

    return new Response(
      JSON.stringify({
        ok: true,
        updated,
        message: `Updated ${updated} game results`,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("Handler error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

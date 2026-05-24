import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripTags(html: string): string {
  return (html || "").replace(/<[^>]+>/g, "").trim();
}

async function fetchScheduleFromKbo() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const url =
      "https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList";
    const params = new URLSearchParams({
      leId: "1",
      srIdList: "0,9,6",
      seasonId: year.toString(),
      gameMonth: month.toString(),
      teamId: "HH",
    });

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (compatible; WinFairy/1.0; +https://github.com/)",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.koreabaseball.com/Schedule/Schedule.aspx",
      Origin: "https://www.koreabaseball.com",
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: params.toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const json = await response.json();
    return json.rows || [];
  } catch (err) {
    console.error("Fetch error:", err);
    return [];
  }
}

async function updateMatches(supabase: any, rows: any[]) {
  let updated = 0;

  for (const block of rows) {
    try {
      const cells = block.row;
      if (!Array.isArray(cells) || cells.length < 9) continue;

      // 날짜 추출
      const dayText = stripTags(cells[0]?.Text || "");
      const dateMatch = dayText.match(/(\d{1,2})\.(\d{1,2})\(/);
      if (!dateMatch) continue;

      const now = new Date();
      const year = now.getFullYear();
      const monthNum = parseInt(dateMatch[1], 10);
      const dayNum = parseInt(dateMatch[2], 10);

      const gameDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;

      // 경기 정보 추출 - 한화가 포함되어 있는지만 확인
      const playText = cells[2]?.Text || "";
      if (!playText.includes("한화")) continue;

      // 스코어만 추출 (간단하게)
      const scoreMatch = playText.match(
        /<span class="(?:lose|win)">(\d+)<\/span><span>vs<\/span><span class="(?:lose|win)">(\d+)<\/span>/
      );

      if (!scoreMatch) continue; // 스코어 없으면 경기 전

      const score1 = parseInt(scoreMatch[1], 10);
      const score2 = parseInt(scoreMatch[2], 10);

      // 경기장 정보로 상대팀 특정 (임시)
      const stadiumText = stripTags(cells[7]?.Text || "");

      // 모든 한화 경기 업데이트 (상대팀을 정확히 추출하지 못할 수도 있으니)
      const { data: matchData } = await supabase
        .from("matches")
        .select("id, opponent_team, home_away")
        .eq("game_date", gameDate)
        .limit(1);

      if (matchData && matchData.length > 0) {
        const match = matchData[0];
        const hanwhaScore = match.home_away === "HOME" ? score1 : score2;
        const opponentScore = match.home_away === "HOME" ? score2 : score1;

        let winner = null;
        if (hanwhaScore > opponentScore) {
          winner = "한화";
        } else if (opponentScore > hanwhaScore) {
          winner = match.opponent_team;
        }

        const { error } = await supabase
          .from("matches")
          .update({
            hanwha_score: hanwhaScore,
            opponent_score: opponentScore,
            winner_team: winner,
          })
          .eq("id", match.id);

        if (!error) {
          updated++;
        }
      }
    } catch (err) {
      console.error("Row update error:", err);
      continue;
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

    const rows = await fetchScheduleFromKbo();
    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          updated: 0,
          message: "No games found",
        }),
        { headers: corsHeaders }
      );
    }

    const updated = await updateMatches(supabase, rows);

    return new Response(
      JSON.stringify({
        ok: true,
        updated,
        message: `Updated ${updated} game results`,
      }),
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

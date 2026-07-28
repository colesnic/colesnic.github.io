import Anthropic from "@anthropic-ai/sdk";
import { loadAllHappyHours } from "@/lib/db";
import {
  searchHappyHours,
  chicagoNow,
  type SearchParams,
  type SearchResult,
  type UserLocation,
} from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  location?: UserLocation | null;
}

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_happy_hours",
  description:
    "Search Chicago happy hours by neighborhood, day, time, drink/food type, atmosphere, and price. " +
    "Call this whenever the user is looking for a happy hour, even if they only give vague preferences. " +
    "Leave parameters out when the user did not specify them.",
  input_schema: {
    type: "object",
    properties: {
      neighborhoods: {
        type: "array",
        items: { type: "string" },
        description:
          "Chicago neighborhoods to search, e.g. ['West Loop', 'Wicker Park', 'Logan Square'].",
      },
      day: {
        type: "string",
        description:
          "Day of week as Mon/Tue/Wed/Thu/Fri/Sat/Sun, or 'today'. Use 'today' for 'right now' or 'tonight'.",
      },
      time: {
        type: "string",
        description: "Target time in 24h HH:MM, or 'now'.",
      },
      open_now: {
        type: "boolean",
        description:
          "True to only return venues whose happy hour is currently running (use for 'right now'/'open now').",
      },
      categories: {
        type: "array",
        items: { type: "string" },
        description:
          "Preference tags: e.g. cocktails, beer, wine, oysters, tacos, margaritas, rooftop, patio, sports, dive, date night, cheap.",
      },
      max_price_level: {
        type: "integer",
        description: "1 (cheap $), 2 ($$), or 3 ($$$). Return venues at or below this level.",
      },
      query: {
        type: "string",
        description: "Any freeform keywords not captured by the other fields.",
      },
    },
    required: [],
  },
};

function systemPrompt(): string {
  const now = chicagoNow();
  return [
    "You are the Chicago Happy Hour Finder — a friendly, concise local guide.",
    `Right now in Chicago it is ${now.label} (day code: ${now.day}, time: ${now.time}).`,
    "",
    "Your job: help people find happy hours near them using natural-language preferences.",
    "Use the search_happy_hours tool to look up real options before recommending anything —",
    "never invent venues, times, or deals. Only describe venues returned by the tool.",
    "",
    "Guidelines:",
    "- Keep replies short and skimmable. The app renders result cards below your message,",
    "  so don't repeat every detail — give a one-line intro and a sentence or two of guidance.",
    "- If the user says 'near me' / 'right now' / 'tonight', search with open_now and today.",
    "- If preferences are vague, make a reasonable search rather than asking many questions.",
    "- If nothing matches, say so plainly and suggest loosening a filter (time, price, or area).",
    "- Mention that details can change and to confirm with the venue.",
  ].join("\n");
}

/** Heuristic fallback used when no ANTHROPIC_API_KEY is configured. */
function heuristicSearch(text: string): SearchParams {
  const t = text.toLowerCase();
  const params: SearchParams = {};

  const hoods = [
    "River North",
    "West Loop",
    "Wicker Park",
    "Logan Square",
    "Lincoln Park",
    "Lakeview",
    "The Loop",
    "Pilsen",
    "Old Town",
    "Gold Coast",
    "Andersonville",
    "South Loop",
    "Bucktown",
    "Hyde Park",
  ];
  const matchedHoods = hoods.filter((h) =>
    t.includes(h.toLowerCase()) || (h === "The Loop" && /\bthe loop\b|\bloop\b/.test(t)),
  );
  if (matchedHoods.length) params.neighborhoods = matchedHoods;

  const cats = [
    "cocktails",
    "beer",
    "wine",
    "oysters",
    "tacos",
    "margaritas",
    "rooftop",
    "patio",
    "sports",
    "dive",
    "tiki",
    "mezcal",
    "wings",
    "date night",
  ];
  const matchedCats = cats.filter((c) => t.includes(c));
  if (matchedCats.length) params.categories = matchedCats;

  if (/\b(cheap|budget|affordable|\$)\b/.test(t)) params.max_price_level = 1;
  if (/(right now|open now|tonight|now)/.test(t)) {
    params.open_now = true;
    params.day = "today";
  }

  params.query = text;
  return params;
}

function heuristicReply(results: SearchResult[], location: boolean): string {
  if (results.length === 0) {
    return "I couldn't find a happy hour matching that. Try a different neighborhood, a later time, or a lower price.";
  }
  const near = location ? " nearest you" : "";
  return `Here are some happy hours${near} that fit. Details can change — confirm with the venue before heading out.`;
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const location = body.location ?? undefined;
  const all = await loadAllHappyHours();

  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  // ---- Fallback: no API key configured -----------------------------------
  if (!process.env.ANTHROPIC_API_KEY) {
    const params = heuristicSearch(lastUser?.content ?? "");
    const results = searchHappyHours(all, params, location);
    return Response.json({
      reply: heuristicReply(results, !!location),
      results,
      degraded: true,
    });
  }

  // ---- AI path: Claude with a tool-use loop -------------------------------
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let lastResults: SearchResult[] = [];

  try {
    let finalText = "";
    // Bounded loop: the model may search, then respond.
    for (let i = 0; i < 4; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt(),
        tools: [SEARCH_TOOL],
        messages: convo,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Collect any text the model produced this turn.
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) finalText = text;

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        break;
      }

      convo.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let results: SearchResult[] = [];
        if (tu.name === "search_happy_hours") {
          results = searchHappyHours(all, tu.input as SearchParams, location);
          lastResults = results;
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(
            results.map((r) => ({
              name: r.name,
              neighborhood: r.neighborhood,
              days: r.days,
              start: r.start,
              end: r.end,
              deals: r.deals,
              vibe: r.vibe,
              price: "$".repeat(r.priceLevel),
              open_now: r.openAtQueryTime ?? null,
              distance_miles:
                r.distanceMiles != null
                  ? Math.round(r.distanceMiles * 10) / 10
                  : null,
            })),
          ),
        });
      }
      convo.push({ role: "user", content: toolResults });
    }

    return Response.json({
      reply: finalText || "Here's what I found.",
      results: lastResults,
    });
  } catch (err) {
    console.error("Anthropic request failed:", err);
    // Fall back to heuristic search so the user still gets results.
    const params = heuristicSearch(lastUser?.content ?? "");
    const results = searchHappyHours(all, params, location);
    return Response.json({
      reply: heuristicReply(results, !!location),
      results,
      degraded: true,
    });
  }
}

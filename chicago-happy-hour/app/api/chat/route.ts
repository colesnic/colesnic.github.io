import { GoogleGenAI, Type, type Content, type Part } from "@google/genai";
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

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  location?: UserLocation | null;
}

const SEARCH_DECLARATION = {
  name: "search_happy_hours",
  description:
    "Search Chicago happy hours by neighborhood, day, time, drink/food type, atmosphere, and price. " +
    "Call this whenever the user is looking for a happy hour, even if they only give vague preferences. " +
    "Leave parameters out when the user did not specify them.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      neighborhoods: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Chicago neighborhoods to search, e.g. ['West Loop', 'Wicker Park', 'Logan Square'].",
      },
      day: {
        type: Type.STRING,
        description:
          "Day of week as Mon/Tue/Wed/Thu/Fri/Sat/Sun, or 'today'. Use 'today' for 'right now' or 'tonight'.",
      },
      time: {
        type: Type.STRING,
        description: "Target time in 24h HH:MM, or 'now'.",
      },
      open_now: {
        type: Type.BOOLEAN,
        description:
          "True to only return venues whose happy hour is currently running (use for 'right now'/'open now').",
      },
      categories: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          "Preference tags: e.g. cocktails, beer, wine, oysters, tacos, margaritas, rooftop, patio, sports, dive, date night, cheap.",
      },
      max_price_level: {
        type: Type.INTEGER,
        description:
          "1 (cheap $), 2 ($$), or 3 ($$$). Return venues at or below this level.",
      },
      query: {
        type: Type.STRING,
        description: "Any freeform keywords not captured by the other fields.",
      },
    },
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

/** Compact venue shape returned to the model as tool output. */
function compact(r: SearchResult) {
  return {
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
      r.distanceMiles != null ? Math.round(r.distanceMiles * 10) / 10 : null,
  };
}

/** Heuristic fallback used when no GEMINI_API_KEY is configured. */
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
  const matchedHoods = hoods.filter(
    (h) =>
      t.includes(h.toLowerCase()) ||
      (h === "The Loop" && /\bthe loop\b|\bloop\b/.test(t)),
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
  if (!process.env.GEMINI_API_KEY) {
    const params = heuristicSearch(lastUser?.content ?? "");
    const results = searchHappyHours(all, params, location);
    return Response.json({
      reply: heuristicReply(results, !!location),
      results,
      degraded: true,
    });
  }

  // ---- AI path: Gemini with function calling -----------------------------
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const contents: Content[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let lastResults: SearchResult[] = [];

  try {
    let finalText = "";
    // Bounded loop: the model may call the search tool, then respond.
    for (let i = 0; i < 4; i++) {
      const resp = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: systemPrompt(),
          tools: [{ functionDeclarations: [SEARCH_DECLARATION] }],
        },
      });

      if (resp.text) finalText = resp.text;

      const calls = resp.functionCalls ?? [];
      if (calls.length === 0) break;

      // Echo the model's function-call turn back into the conversation.
      const modelContent = resp.candidates?.[0]?.content;
      if (modelContent) contents.push(modelContent);

      const responseParts: Part[] = [];
      for (const call of calls) {
        let results: SearchResult[] = [];
        if (call.name === "search_happy_hours") {
          results = searchHappyHours(
            all,
            (call.args ?? {}) as unknown as SearchParams,
            location,
          );
          lastResults = results;
        }
        responseParts.push({
          functionResponse: {
            name: call.name ?? "search_happy_hours",
            response: { results: results.map(compact) },
          },
        });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    return Response.json({
      reply: finalText || "Here's what I found.",
      results: lastResults,
    });
  } catch (err) {
    console.error("Gemini request failed:", err);
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

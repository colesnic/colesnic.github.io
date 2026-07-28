import type { Day, HappyHour } from "./happy-hours";

export const DAYS: Day[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface SearchParams {
  neighborhoods?: string[];
  /** "Mon".."Sun", or "today". */
  day?: string;
  /** 24h "HH:MM", or "now". */
  time?: string;
  /** Only return venues whose happy hour is currently running. */
  open_now?: boolean;
  categories?: string[];
  /** 1-3. Only return venues at this price level or cheaper. */
  max_price_level?: number;
  /** Freeform keywords. */
  query?: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export interface SearchResult extends HappyHour {
  /** Distance from the user in miles, if a location was provided. */
  distanceMiles?: number;
  /** Whether the happy hour is running at the resolved day/time. */
  openAtQueryTime?: boolean;
}

/** Current date/time in Chicago (America/Chicago), regardless of server TZ. */
export function chicagoNow(): { day: Day; time: string; label: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday") as Day;
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const minute = get("minute");
  const time = `${hour}:${minute}`;

  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  return { day: weekday, time, label };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

function haversineMiles(a: UserLocation, b: { lat: number; lng: number }): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

/** Resolve a day string ("today" | "Mon" | "Monday" | ...) to a Day code. */
function resolveDay(input: string | undefined, fallback: Day): Day {
  if (!input) return fallback;
  const s = normalize(input);
  if (s === "today" || s === "now") return fallback;
  const match = DAYS.find((d) => normalize(d) === s.slice(0, 3));
  return match ?? fallback;
}

export function searchHappyHours(
  all: HappyHour[],
  params: SearchParams,
  location?: UserLocation,
): SearchResult[] {
  const now = chicagoNow();
  const day = resolveDay(params.day, now.day);
  const time =
    params.time && params.time !== "now" ? params.time : now.time;
  const queryMinutes = toMinutes(time);

  const wantCats = (params.categories ?? []).map(normalize);
  const queryTerms = normalize(params.query ?? "")
    .split(/\s+/)
    .filter(Boolean);

  const results: SearchResult[] = [];

  for (const hh of all) {
    // Neighborhood filter
    if (params.neighborhoods && params.neighborhoods.length > 0) {
      const hood = normalize(hh.neighborhood);
      const ok = params.neighborhoods.some((n) => {
        const nn = normalize(n);
        return hood.includes(nn) || nn.includes(hood);
      });
      if (!ok) continue;
    }

    // Price filter
    if (params.max_price_level && hh.priceLevel > params.max_price_level) {
      continue;
    }

    // Day filter (only when a specific day or open_now is requested)
    const runsOnDay = hh.days.includes(day);
    if ((params.day || params.open_now) && !runsOnDay) {
      continue;
    }

    const openAtQueryTime =
      runsOnDay &&
      queryMinutes >= toMinutes(hh.start) &&
      queryMinutes <= toMinutes(hh.end);

    if (params.open_now && !openAtQueryTime) {
      continue;
    }

    // Category / keyword scoring
    const haystack = normalize(
      [
        hh.name,
        hh.neighborhood,
        hh.vibe,
        hh.categories.join(" "),
        hh.deals.join(" "),
      ].join(" "),
    );

    let score = 0;
    let categoryMiss = false;
    for (const cat of wantCats) {
      if (haystack.includes(cat)) score += 3;
      else categoryMiss = true;
    }
    // If specific categories were requested and none matched, skip.
    if (wantCats.length > 0 && categoryMiss && score === 0) continue;

    for (const term of queryTerms) {
      if (haystack.includes(term)) score += 1;
    }

    const result: SearchResult = { ...hh, openAtQueryTime };
    if (location) {
      result.distanceMiles = haversineMiles(location, hh);
    }
    // stash score for sorting
    (result as SearchResult & { _score: number })._score = score;
    results.push(result);
  }

  results.sort((a, b) => {
    const sa = (a as SearchResult & { _score: number })._score ?? 0;
    const sb = (b as SearchResult & { _score: number })._score ?? 0;
    // Open-now venues float up
    if (a.openAtQueryTime !== b.openAtQueryTime) {
      return a.openAtQueryTime ? -1 : 1;
    }
    if (location && a.distanceMiles != null && b.distanceMiles != null) {
      if (Math.abs(a.distanceMiles - b.distanceMiles) > 0.25) {
        return a.distanceMiles - b.distanceMiles;
      }
    }
    if (sb !== sa) return sb - sa;
    return a.priceLevel - b.priceLevel;
  });

  return results.slice(0, 8).map((r) => {
    const { _score, ...rest } = r as SearchResult & { _score?: number };
    return rest;
  });
}

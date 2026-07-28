import { HAPPY_HOURS, type HappyHour, type Day } from "./happy-hours";

/**
 * Loads all happy hours.
 *
 * If a Postgres database is attached (Vercel Postgres / Neon sets POSTGRES_URL),
 * rows are read from the `happy_hours` table. Otherwise the app falls back to the
 * bundled sample dataset, so it runs with zero configuration.
 *
 * The dataset is small, so search/filtering happens in memory in lib/search.ts.
 */
export async function loadAllHappyHours(): Promise<HappyHour[]> {
  if (!process.env.POSTGRES_URL) {
    return HAPPY_HOURS;
  }

  try {
    // Imported lazily so the app doesn't require the package at runtime when no
    // database is configured.
    const { sql } = await import("@vercel/postgres");
    const { rows } = await sql`SELECT * FROM happy_hours`;
    if (!rows || rows.length === 0) return HAPPY_HOURS;

    return rows.map((r): HappyHour => ({
      id: String(r.id),
      name: String(r.name),
      neighborhood: String(r.neighborhood),
      address: String(r.address),
      lat: Number(r.lat),
      lng: Number(r.lng),
      days: (r.days as Day[]) ?? [],
      start: String(r.start_time),
      end: String(r.end_time),
      deals: (r.deals as string[]) ?? [],
      categories: (r.categories as string[]) ?? [],
      vibe: String(r.vibe),
      priceLevel: Number(r.price_level) as 1 | 2 | 3,
    }));
  } catch (err) {
    // Any DB error falls back to bundled data rather than breaking the chat.
    console.error("DB read failed, using bundled data:", err);
    return HAPPY_HOURS;
  }
}

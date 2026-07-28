// Seed the optional Postgres database from data/happy-hours.json.
//
// Usage (after attaching Vercel Postgres / setting POSTGRES_URL in .env.local):
//   npm run seed
//
// The app runs fine without a database — it falls back to the bundled dataset.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sql } from "@vercel/postgres";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(join(here, "..", "data", "happy-hours.json"), "utf8"),
);

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error(
      "POSTGRES_URL is not set. Attach a database (Vercel Postgres / Neon) and " +
        "add its connection string to .env.local before seeding.",
    );
    process.exit(1);
  }

  console.log("Creating table…");
  await sql`
    CREATE TABLE IF NOT EXISTS happy_hours (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      address      TEXT NOT NULL,
      lat          DOUBLE PRECISION NOT NULL,
      lng          DOUBLE PRECISION NOT NULL,
      days         JSONB NOT NULL,
      start_time   TEXT NOT NULL,
      end_time     TEXT NOT NULL,
      deals        JSONB NOT NULL,
      categories   JSONB NOT NULL,
      vibe         TEXT NOT NULL,
      price_level  SMALLINT NOT NULL
    );
  `;

  console.log(`Seeding ${data.length} venues…`);
  for (const h of data) {
    await sql`
      INSERT INTO happy_hours
        (id, name, neighborhood, address, lat, lng, days, start_time, end_time, deals, categories, vibe, price_level)
      VALUES
        (${h.id}, ${h.name}, ${h.neighborhood}, ${h.address}, ${h.lat}, ${h.lng},
         ${JSON.stringify(h.days)}, ${h.start}, ${h.end},
         ${JSON.stringify(h.deals)}, ${JSON.stringify(h.categories)},
         ${h.vibe}, ${h.priceLevel})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        neighborhood = EXCLUDED.neighborhood,
        address = EXCLUDED.address,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        days = EXCLUDED.days,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        deals = EXCLUDED.deals,
        categories = EXCLUDED.categories,
        vibe = EXCLUDED.vibe,
        price_level = EXCLUDED.price_level;
    `;
  }

  console.log("Done. ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

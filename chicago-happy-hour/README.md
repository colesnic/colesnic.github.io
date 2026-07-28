# Chicago Happy Hour Finder 🍸

An AI-native, minimalist chat app for finding Chicago happy hours near you using
natural-language preferences. Tell it what you're in the mood for — _"cheap
drafts open right now near me"_, _"rooftop cocktails in River North"_, _"$1
oysters in the West Loop"_ — and it finds the spot.

Built with **Next.js + React**, an **Anthropic Claude** tool-use backend, and an
optional **free Postgres** database. Deploys to **Vercel** in one click.

## How it works

- The chat UI (`app/page.tsx`) sends the conversation — plus your location if you
  opt in — to `/api/chat`.
- The API route (`app/api/chat/route.ts`) calls Claude with a `search_happy_hours`
  tool. Claude interprets the natural-language request (neighborhood, drink type,
  vibe, price, "open now"), calls the tool, and writes a short reply. The matched
  venues are rendered as cards below the message.
- Search + distance ranking (`lib/search.ts`) runs against the venue data
  (`lib/db.ts`), which reads from Postgres if attached, otherwise the bundled
  sample dataset (`data/happy-hours.json`).

The app is **resilient**: with no `ANTHROPIC_API_KEY` it falls back to a keyword
search, and with no database it uses the bundled data — so it runs with zero
configuration for local development.

## Run locally

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY (optional)
npm run dev                  # http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a Git repo.
2. In Vercel, **New Project** → import the repo → set **Root Directory** to
   `chicago-happy-hour`. The framework preset is Next.js.
3. Add the `ANTHROPIC_API_KEY` environment variable.
4. Deploy.

### Add the free database (optional)

1. In your Vercel project: **Storage → Create Database → Postgres** (Neon-backed,
   free tier). Vercel wires up the `POSTGRES_URL` env vars automatically.
2. Seed it:
   ```bash
   vercel env pull .env.local   # pulls POSTGRES_URL locally
   npm run seed                 # creates the table and loads data/happy-hours.json
   ```
3. Redeploy. The app now reads venues from Postgres. Edit `data/happy-hours.json`
   and re-run `npm run seed` to update.

## Configuration

| Variable            | Required | Default            | Purpose                                   |
| ------------------- | -------- | ------------------ | ----------------------------------------- |
| `ANTHROPIC_API_KEY` | No\*     | —                  | Enables the natural-language AI chat path |
| `ANTHROPIC_MODEL`   | No       | `claude-sonnet-5`  | Which Claude model to use                 |
| `POSTGRES_URL`      | No       | —                  | Use Postgres instead of the bundled data  |

\*Without a key the app still works, using a keyword-based fallback search.

## Note on data

The venues in `data/happy-hours.json` are **illustrative sample data** for the
demo, not a live listing. Deals and times change constantly — always confirm with
the venue. To make it real, replace the dataset (or wire the search to a live
source) and re-seed.

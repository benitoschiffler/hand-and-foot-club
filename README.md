# Hand and Foot Club

Browser game for your custom Hand and Foot ruleset, with:

- Online room play through Supabase
- Local play against CPU (`easy`, `medium`, `hard`)
- Email magic-link login
- All-time score tracking hooks

## Run

```bash
npm install
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill in the URL and anon key.
3. Run the SQL in [`supabase/schema.sql`](./supabase/schema.sql).
4. In Supabase Auth, enable Email OTP / magic links.
5. In Supabase Auth URL configuration, allow both your Vercel app URL and `http://localhost:5173`.

Without Supabase env vars, the app still runs in local-only mode for CPU play and rules testing.

## New Computer Setup

Use this flow any time you move to a new Mac or another Codex machine:

1. Clone or download this repo onto the new computer.
2. Open the repo folder in Codex or GitHub Desktop.
3. Run:

```bash
npm install
```

4. Create a local env file:

```bash
cp .env.example .env.local
```

5. Fill `.env.local` with your existing Supabase project values:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

6. Start local dev:

```bash
npm run dev
```

7. If you changed the site URL in Supabase for production, keep `http://localhost:5173` in the allowed redirect URLs so local magic-link login still works.

8. Push code changes to GitHub, and let Vercel redeploy from the repo.

Recommended long-term setup:

- GitHub is the source of truth for the code.
- Vercel is connected to the GitHub repo for deploys.
- Supabase stays as the shared backend and does not need to be recreated on the new machine.

## House rules implemented

- Two facedown piles of 7 cards are dealt to each player; each player chooses which becomes the visible hand and which remains the foot.
- Draw exactly two cards per turn unless you pick up the discard pile with one card, in which case you also draw one from stock.
- Melds can be sets or same-suit runs from `4` through `A`.
- `2`s and Jokers are wild and worth `20`.
- `3`s are always bad, cannot be melded, and should be discarded.
- New melds need at least `15` points each.
- First go-down requires `90` points total laid that turn.
- Winner scores `0`; everyone else scores the value of unplayed cards left in hand/foot.

## Notes

- The online room flow is intentionally simple: create a room code, join from another browser, and the game state syncs through a shared row in Supabase.
- CPU heuristics are lightweight but distinct by difficulty.
- Do not commit `.env.local`; use Vercel environment variables for deployment.

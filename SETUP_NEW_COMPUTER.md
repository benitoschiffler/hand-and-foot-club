# New Computer Setup

This project is designed to move cleanly between Macs.

## What you already have

- GitHub Desktop installed
- A Supabase project already created
- A Vercel project already created

## Best workflow

1. Keep the code in GitHub.
2. On a new computer, clone the repo from GitHub.
3. Recreate only the local `.env.local` file.
4. Use the existing Supabase project and existing Vercel project.

## New machine steps

```bash
git clone <your-github-repo-url>
cd Cards
npm install
cp .env.example .env.local
```

Then put your existing values into `.env.local`:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then run:

```bash
npm run dev
```

## Supabase reminders

- The database schema only had to be run once in the existing Supabase project.
- Email OTP / magic-link auth should stay enabled.
- Allowed auth URLs should include your Vercel URL and `http://localhost:5173`.

## Vercel reminders

- Vercel should stay connected to the GitHub repo.
- Vercel environment variables should include:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Fastest recovery path

If you ever lose local setup on a machine:

1. Clone the repo again.
2. Run `npm install`.
3. Recreate `.env.local`.
4. Run `npm run dev`.

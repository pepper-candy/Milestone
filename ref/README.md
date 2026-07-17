# ref/ (local only)

This folder holds **private working materials** (DB snapshots, invite/account exports, session photos, SQL scratchpads). It is listed in `.gitignore` and must not be committed.

## What belongs here (keep on your machine)

- `snapshot_supabase_*` — real profile / session / task CSV dumps
- `account.csv`, `Account.xlsx` — invite codes (these are login passwords in this app)
- `IMG_*`, session desk photos
- `supabase/` — SQL migrations and fixes run manually in the Supabase SQL Editor

## Safe to discuss in public docs

- Product notes that contain **no** live codes, UUIDs, GPS, or blob URLs
- Fake sample rows only, e.g. invite code `DEMO01`, nickname `Sample Mentor`

App runtime data that used to live here (e.g. daily quotes) now lives under `src/data/` so Vercel builds work without committing private `ref/` dumps.

## Blob URLs (`*.public.blob.vercel-storage.com/...`)

Those URLs live **inside** snapshot CSVs / photos under `ref/`. Ignoring `ref/` keeps them out of git.  
`next.config.ts` only allows the hostname pattern for Next.js Image — that is not a secret.

Tokens stay in env (never commit):

- `BLOB_READ_WRITE_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_*` values in `.env.local`

If this repo was ever pushed with `ref/` included, treat leaked invite codes as burned and rotate them in Supabase.

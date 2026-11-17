# Architecture

## The three layers

| Layer | Who uses it | Where it runs | Notes |
|---|---|---|---|
| Studio console | You | `apps/web` under `/studio` | Role `studio` only. Creates accounts, assigns trades, pauses, monitors. |
| Client portal and editor | Your clients | `apps/web` under `/portal` | Sees only companies in the trades you assigned (Postgres row level security). |
| Customer sites | Visitors | `apps/edge` (Cloudflare Worker) | Static HTML from R2, found by hostname, status checked on every request. |

## How a website gets published

1. A client saves a draft (JSON) in Postgres (`sites.draft`). Uploaded images go to R2.
2. The client presses Publish. `POST /api/sites/:id/publish` confirms the user may edit the site, then `packages/publisher` calls `sitegen.gen(draft)`.
3. The HTML is written to R2 at `<slug>/<version>/index.html`. Workers KV entries `host:<hostname>` point each hostname at that version and carry a `status` of `active` or `paused`.
4. A visitor asks for the site. The Worker reads `host:<hostname>` from KV, refuses when the status is `paused`, and streams the file from R2.

Pausing a client rewrites the KV entries, so the site goes dark within seconds without touching the client's files.

## Other edge endpoints

- `POST /api/lead`: contact form posts. The hostname must belong to an active site. Spam checked with Turnstile, stored in `leads` with the service key.
- `GET /api/reviews?pid=`: Google Places proxy that hides the API key. Never cached, because Google does not allow storing Places content.
- `GET /api/licence?k=&h=`: licence check for exported or third-party-hosted copies.

## Packages

- `packages/sitegen`: the generator extracted from the prototype. Pure functions, no browser needed.
- `packages/publisher`: publish and pause steps with injected I/O, so they are unit tested.
- `supabase/migrations`: tables, row level security, triggers.
- `prototype/`: the single-file prototype, kept as the reference for behaviour.

## Data model

`profiles` (role), `clients`, `client_users`, `client_trades`, `trades`, `niches`, `sites`, `domains`, `leads`, `requests`, `audit_log`.

A client can reach a site only if the client is active, owns the site, and holds the trade that the site's niche belongs to. Style families and decor shapes that belong to a trade are checked the same way in the editor and again on publish.

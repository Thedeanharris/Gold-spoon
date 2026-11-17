# Setup

## Accounts to create

| Service | Used for | Notes |
|---|---|---|
| GitHub | Code, CI, deploys | Create an organisation or use your own account. Private repo. |
| Cloudflare | Hosting customer sites, domains, Worker, R2, KV | Move your studio domain here. Enable SSL for SaaS for client custom domains. |
| Supabase | Postgres, sign in, row level security | There is no South Africa region. Pick Frankfurt or London. See the stack plan for the POPIA note. |
| Google Cloud | Places API key for reviews | Restrict the key to the Places API. |
| Paystack or PayFast | Billing your clients | Check eligibility for your company first. Stripe does not onboard South African companies. |
| Resend or Postmark | Account invites and lead emails | Verify your sending domain. |
| Sentry | Error tracking | Optional at first. |

## First run

1. **Database.** Create the Supabase project. Install the Supabase CLI, then `supabase link --project-ref <ref>` and `supabase db push`. Run `supabase/seed.sql` once. In Authentication, turn off public sign ups.
2. **First studio user.** Add yourself under Authentication, then in the SQL editor: `insert into profiles (id, role, full_name) values ('<your auth user id>', 'studio', 'Your name');` Turn on two factor authentication for this user.
3. **Cloudflare.** Create a KV namespace and an R2 bucket named `studio-sites`. Put the namespace id into `apps/edge/wrangler.toml`. In `apps/edge` run `npx wrangler secret put` for each secret in `.env.example`, then `npx wrangler deploy`. Route `*.sites.example.com/*` to the Worker.
4. **Web app.** Copy `.env.example` to `.env.local` and fill it in. `pnpm install`, then `pnpm dev:web`.
5. **First publish.** Create a client and a site in the console, publish it, and open `<slug>.sites.example.com`.

## GitHub secrets and variables

Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
Variables: `SUPABASE_PROJECT_REF`, `DEPLOY_ENABLED` (set to `true` when you want pushes to `main` to deploy).

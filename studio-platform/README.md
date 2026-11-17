# Studio Platform

A website builder and client portal for a studio that sells managed websites to small businesses.

1. **Studio console** (you): create client accounts, assign trades, pause accounts, watch activity.
2. **Client portal and editor**: clients edit only the companies and trades you give them.
3. **Customer sites**: static pages served from your own edge, so you stay in control.

`prototype/studio-platform.html` is the working front-end prototype. Open it in a browser to see the behaviour this repo has to reproduce.

## What is in the repo

| Path | What it is | Status |
|---|---|---|
| `packages/sitegen` | The site generator taken from the prototype. Draft in, HTML out. | Tested |
| `packages/publisher` | Publish and pause steps with injected I/O. | Tested |
| `apps/edge` | Cloudflare Worker that serves sites, takes leads, proxies Google reviews and answers licence checks. | Tested with mocks |
| `supabase/migrations` | Tables, row level security and triggers. | Written, not yet run against a database |
| `apps/web` | Next.js app for the studio console and client portal. | Thin scaffold, not yet built |
| `docs` | Architecture, setup and security notes. | |

## Try it

```bash
node --version      # 22 or newer
npm test            # runs every test, no install needed
```

## Put it on GitHub

```bash
git init -b main
git add .
git commit -m "Initial commit"
gh repo create YOUR-ORG/studio-platform --private --source=. --push
```

Without the GitHub CLI, create an empty private repository on github.com, then:

```bash
git remote add origin git@github.com:YOUR-ORG/studio-platform.git
git push -u origin main
```

After the first push: protect `main` (require a pull request and the CI check), enable Dependabot and secret scanning, and add the secrets listed in `docs/SETUP.md`.

## Next steps

Follow `docs/SETUP.md` to create the accounts and run the first migration, then port the prototype's editor into `apps/web` one panel at a time, using `packages/sitegen` for the preview.

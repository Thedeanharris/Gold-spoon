# Security and control

## What keeps the platform yours

1. Accounts are created by the studio. There is no public sign up.
2. Access is enforced in Postgres (row level security), not in the browser. A client who edits the page's JavaScript still cannot read another client's rows or use a trade they do not hold.
3. The editor, presets and generator are served only after sign in. Customer sites are served from your edge, which checks status on every request.
4. Pausing an account or a site takes effect at the edge within seconds.
5. An audit log records studio and client actions. Every client has a licence key.

## Honest limits

- Anything a browser can display can be copied. Customer sites are public HTML, so a determined person can save a page. Hosting only on your edge, no export for clients, terms of service and takedown notices are the real protection, not code tricks.
- Protecting the builder itself means keeping its logic server side where possible and putting the app behind sign in, with two factor authentication for studio users.

## Before launch

- [ ] Two factor authentication required for studio users
- [ ] Row level security tests for each role: studio, client, anonymous
- [ ] Service key only in Worker and server secrets, never in the browser
- [ ] Turnstile on every public form
- [ ] POPIA: privacy policy, operator agreement with each client, Information Officer named, breach process
- [ ] Google reviews: Google attribution shown, no caching of Places content
- [ ] Backups and a restore drill

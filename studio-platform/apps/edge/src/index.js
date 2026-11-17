// Cloudflare Worker: serves published customer sites and the small public API they need.
// Bindings (wrangler.toml): TENANTS (KV), SITES (R2).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_PLACES_KEY, TURNSTILE_SECRET.
// Every endpoint works on the visitor's own hostname, so requests are same-origin and need no CORS.

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const page = (title, text, status) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:18px system-ui;padding:12vh 24px;text-align:center"><h1 style="font-size:28px">${title}</h1><p>${text}</p>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store", ...SECURITY_HEADERS } },
  );

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

const tenant = (env, host) => env.TENANTS.get("host:" + host.toLowerCase(), "json");

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/api/lead") return await lead(req, env, url);
      if (url.pathname === "/api/reviews") return await reviews(env, url);
      if (url.pathname === "/api/licence") return await licence(env, url);
      return await serve(req, env, url);
    } catch (err) {
      return json({ ok: false, error: "server_error" }, 500);
    }
  },
};

async function serve(req, env, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return page("Not allowed", "This address only serves web pages.", 405);
  const t = await tenant(env, url.hostname);
  if (!t) return page("Site not found", "There is no website at this address yet.", 404);
  if (t.status !== "active") return page("This site is paused", "Please contact the studio that manages this website.", 503);
  const path = /\.[a-z0-9]+$/i.test(url.pathname) ? url.pathname : "/index.html";
  const obj = await env.SITES.get(`${t.site}/${t.ver}${path}`);
  if (!obj) return page("Page not found", "That page does not exist.", 404);
  const h = new Headers(SECURITY_HEADERS);
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("cache-control", path === "/index.html" ? "public, max-age=60, s-maxage=300" : "public, max-age=3600");
  return new Response(req.method === "HEAD" ? null : obj.body, { headers: h });
}

async function lead(req, env, url) {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  const t = await tenant(env, url.hostname);
  if (!t || t.status !== "active") return json({ ok: false, error: "site" }, 403);
  let b;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }
  if (b.hp) return json({ ok: true }); // honeypot field filled in: pretend it worked
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().slice(0, 200);
  const phone = String(b.phone || "").trim().slice(0, 40);
  const message = String(b.message || "").trim().slice(0, 4000);
  const badEmail = email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (!message || (!email && !phone) || badEmail) return json({ ok: false, error: "invalid" }, 400);
  if (env.TURNSTILE_SECRET) {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(b.token || ""), remoteip: req.headers.get("cf-connecting-ip") || "" }),
    });
    if (!(await r.json()).success) return json({ ok: false, error: "captcha" }, 400);
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/leads`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ site_id: t.siteId, name, email, phone, message, source: "website form" }),
  });
  return res.ok ? json({ ok: true }) : json({ ok: false, error: "store" }, 502);
}

// Google Places proxy. Never cached: Google does not allow storing Places content.
// Show Google's attribution next to the reviews, and say they are shown by relevance.
async function reviews(env, url) {
  const t = await tenant(env, url.hostname);
  if (!t || t.status !== "active") return json({ error: "site" }, 403);
  const pid = url.searchParams.get("pid") || "";
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(pid)) return json({ error: "pid" }, 400);
  const r = await fetch(`https://places.googleapis.com/v1/places/${pid}`, {
    headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY, "X-Goog-FieldMask": "rating,userRatingCount,reviews,googleMapsUri" },
  });
  return r.ok ? json(await r.json()) : json({ error: "google" }, 502);
}

// Licence check for exported or third-party-hosted copies. Unknown keys answer ok:false.
async function licence(env, url) {
  const k = url.searchParams.get("k") || "";
  const h = (url.searchParams.get("h") || "").toLowerCase();
  const rec = k ? await env.TENANTS.get("lic:" + k, "json") : null;
  const ok = !!rec && rec.status === "active" && (!rec.hosts || !rec.hosts.length || rec.hosts.includes(h));
  return json({ ok }, 200, { "access-control-allow-origin": "*" });
}

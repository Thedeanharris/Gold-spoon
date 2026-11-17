import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const kv = {
  "host:acme.sites.test": { site: "acme", siteId: "site-1", ver: 3, status: "active" },
  "host:paused.sites.test": { site: "paused", siteId: "site-2", ver: 1, status: "paused" },
  "lic:STU-GOOD": { status: "active", hosts: ["acme.sites.test"] },
  "lic:STU-OLD": { status: "paused" },
};
const files = { "acme/3/index.html": "<h1>Acme</h1>", "acme/3/logo.png": "png" };
const env = {
  TENANTS: { get: async (k) => (kv[k] ? structuredClone(kv[k]) : null) },
  SITES: {
    get: async (key) =>
      key in files
        ? { body: files[key], httpEtag: '"e1"', writeHttpMetadata: (h) => h.set("content-type", key.endsWith(".html") ? "text/html; charset=utf-8" : "image/png") }
        : null,
  },
  SUPABASE_URL: "https://db.test",
  SUPABASE_SERVICE_KEY: "svc",
  GOOGLE_PLACES_KEY: "gkey",
};
const call = (url, init) => worker.fetch(new Request(url, init), env);
const post = (url, body) => call(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("serves the published page for an active hostname", async () => {
  const r = await call("https://acme.sites.test/");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "<h1>Acme</h1>");
  assert.match(r.headers.get("cache-control"), /max-age=60/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});

test("serves assets from the same version folder", async () => {
  const r = await call("https://acme.sites.test/logo.png");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
});

test("a paused site shows a paused page and is not cached", async () => {
  const r = await call("https://paused.sites.test/");
  assert.equal(r.status, 503);
  assert.match(await r.text(), /paused/i);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("unknown hostnames and missing files give 404", async () => {
  assert.equal((await call("https://nobody.sites.test/")).status, 404);
  assert.equal((await call("https://acme.sites.test/missing.css")).status, 404);
});

test("only GET and HEAD are served", async () => {
  assert.equal((await call("https://acme.sites.test/", { method: "DELETE" })).status, 405);
});

test("a lead is stored for the site that owns the hostname", async () => {
  const seen = [];
  globalThis.fetch = async (u, o) => (seen.push({ u, o }), new Response("", { status: 201 }));
  const r = await post("https://acme.sites.test/api/lead", { name: "Thandi", email: "t@example.com", message: "Quote please" });
  assert.equal(r.status, 200);
  assert.equal(seen[0].u, "https://db.test/rest/v1/leads");
  assert.equal(JSON.parse(seen[0].o.body).site_id, "site-1");
});

test("bad leads are rejected, honeypot is quietly dropped", async () => {
  let calls = 0;
  globalThis.fetch = async () => (calls++, new Response("", { status: 201 }));
  assert.equal((await post("https://acme.sites.test/api/lead", { message: "hi" })).status, 400);
  assert.equal((await post("https://acme.sites.test/api/lead", { email: "nope", message: "hi" })).status, 400);
  assert.equal((await post("https://paused.sites.test/api/lead", { email: "a@b.co", message: "hi" })).status, 403);
  assert.equal((await post("https://acme.sites.test/api/lead", { hp: "bot", email: "a@b.co", message: "hi" })).status, 200);
  assert.equal(calls, 0);
});

test("reviews proxy calls Google with the server key and never caches", async () => {
  let seen;
  globalThis.fetch = async (u, o) => ((seen = { u, o }), new Response(JSON.stringify({ rating: 4.8 }), { status: 200 }));
  const r = await call("https://acme.sites.test/api/reviews?pid=ChIJabcdefghij");
  assert.equal(r.status, 200);
  assert.equal(seen.o.headers["X-Goog-Api-Key"], "gkey");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal((await call("https://acme.sites.test/api/reviews?pid=bad")).status, 400);
});

test("licence check answers ok only for active keys on listed hosts", async () => {
  const ask = async (q) => (await (await call("https://acme.sites.test/api/licence?" + q)).json()).ok;
  assert.equal(await ask("k=STU-GOOD&h=acme.sites.test"), true);
  assert.equal(await ask("k=STU-GOOD&h=copy.example.com"), false);
  assert.equal(await ask("k=STU-OLD&h=acme.sites.test"), false);
  assert.equal(await ask("k=unknown&h=acme.sites.test"), false);
});

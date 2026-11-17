import test from "node:test";
import assert from "node:assert/strict";
import { publishSite, setSiteStatus } from "../src/index.js";
import { gen, seed } from "../../sitegen/src/index.js";

const makeIo = () => {
  const log = { objects: {}, kv: {}, db: [] };
  return {
    log,
    render: gen,
    putObject: async (k, body, type) => { log.objects[k] = { body, type }; },
    putKV: async (k, v) => { log.kv[k] = v; },
    saveDb: async (p) => { log.db.push(p); },
  };
};
const site = () => ({ id: "s1", slug: "acme", version: 2, draft: seed("con", "Acme Builders") });
const ctx = { licence: "STU-TEST", credit: "Powered by Studio", baseDomain: "sites.example.com", domains: ["Acme.co.za"] };

test("publish bumps the version, stores the page and points every hostname at it", async () => {
  const io = makeIo();
  const r = await publishSite(site(), ctx, io);
  assert.equal(r.version, 3);
  assert.deepEqual(r.hosts, ["acme.sites.example.com", "acme.co.za"]);
  const html = io.log.objects["acme/3/index.html"].body;
  assert.match(html, /Acme Builders/);
  assert.match(html, /STU-TEST/);
  assert.match(html, /Powered by Studio/);
  assert.equal(io.log.kv["host:acme.co.za"].ver, 3);
  assert.equal(io.log.kv["host:acme.co.za"].status, "active");
  assert.equal(io.log.db[0].status, "published");
});

test("publishing does not change the draft it was given", async () => {
  const s = site();
  await publishSite(s, ctx, makeIo());
  assert.equal(s.draft.lic, "");
});

test("pause rewrites every hostname so the edge stops serving", async () => {
  const io = makeIo();
  const r = await setSiteStatus(site(), ctx, "paused", io);
  assert.equal(r.changed, 2);
  assert.equal(io.log.kv["host:acme.sites.example.com"].status, "paused");
  assert.equal(io.log.db[0].status, "paused");
});

test("pausing a site that was never published does nothing", async () => {
  const io = makeIo();
  const r = await setSiteStatus({ ...site(), version: 0 }, ctx, "paused", io);
  assert.equal(r.changed, 0);
  assert.equal(io.log.db.length, 0);
});

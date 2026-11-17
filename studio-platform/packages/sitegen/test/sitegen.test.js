import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../src/index.js";

const niches = Object.keys(S.IND).filter((k) => k !== "custom");
const families = Object.keys(S.FAM);
const types = Object.keys(S.TYPES);

// Tiny fake page so the calculator and reviews scripts can run without a browser.
function fakeDom() {
  const els = {};
  const mk = (s) => els[s] || (els[s] = { innerHTML: "", textContent: "", value: "", href: "", className: "", h: {}, addEventListener(t, f) { this.h[t] = f; } });
  globalThis.document = { querySelector: mk };
  return els;
}
const money = (html) => html.match(/Estimated total<\/span><span>([^<]*)/)[1].replace(/\s/g, " ");

test("every niche renders in every style family and website type", () => {
  let n = 0;
  for (const k of niches) for (const f of families) for (const t of types) {
    const d = S.seed(k);
    Object.assign(d, { fam: f, pal: 0, type: t, sec: S.defSec(t) });
    if (t === "shop") d.q.mode = "shop";
    const html = S.gen(d);
    assert.match(html, /<html/);
    assert.match(html, /<footer/);
    n++;
  }
  assert.equal(n, niches.length * families.length * types.length);
});

test("the style library has 50 valid styles", () => {
  assert.equal(S.SL.length, 50);
  for (const s of S.SL) {
    assert.ok(s.fam in S.FAM, s.n);
    assert.ok(s.pal < S.FAM[s.fam].p.length, s.n);
    const d = S.seed("con");
    Object.assign(d, { fam: s.fam, pal: s.pal, hf: s.hf || "", bf: s.bf || "", color: s.color || "#000000", pbg: s.pbg || "" });
    d.bg = { t: s.bg, v: "", ov: 45 };
    assert.match(S.gen(d), /<footer/);
  }
});

test("every decor shape works in every placement", () => {
  for (const m of Object.keys(S.MOT)) for (const p of ["scatter", "float", "corners", "pattern", "divider"]) {
    const d = S.seed("mup");
    d.dc = { m, p, s: 60, o: 30, c: "" };
    const html = S.gen(d);
    if (p === "pattern") assert.match(html, /class="dcp"/);
    else if (p === "divider") assert.match(html, /h2:after\{content/);
    else assert.match(html, /<svg/);
  }
});

test("trade decor is locked to the trades that own it", () => {
  const builder = { trades: ["Construction"], all: 0 };
  assert.ok(S.motifOK(builder, "gear"));
  assert.ok(!S.motifOK(builder, "flower"));
  assert.ok(S.motifOK(builder, "star"));
  assert.ok(S.motifOK({ trades: [], all: 1 }, "flower"));
});

test("layout, button designs and button placements", () => {
  for (const [k, v] of [["hero", "center"], ["hero", "split"], ["wid", "narrow"], ["sp", "airy"], ["rad", "round"], ["ba", "right"]]) {
    const d = S.seed("ita");
    d.lay = { [k]: v };
    assert.match(S.gen(d), /<footer/);
  }
  for (const shape of ["sq", "soft", "pill", "chamfer"]) for (const fill of ["solid", "outline", "soft", "hard", "link"]) {
    const d = S.seed("con");
    d.btn = { shape, fill, size: "l", caps: 1, hov: "lift" };
    assert.match(S.gen(d), /border-radius:/);
  }
  const d = S.seed("con");
  d.bl = [
    { l: "Call us", t: "call", s: "p", at: "hero" },
    { l: "Chat", t: "wa", s: "a", at: "nav" },
    { l: "Pay deposit", t: "pay", s: "p", u: "https://pay.example.com/x", at: "float" },
    { l: "Book", t: "link", s: "a", u: "#contact", at: "bar" },
    { l: "Quote", t: "mail", s: "a", at: "after:services" },
  ];
  const html = S.gen(d);
  for (const need of ['class="fab"', 'class="bbar"', 'class="w ba"', "Pay deposit"]) assert.ok(html.includes(need), need);
});

test("section backgrounds, layouts, payments, Google reviews and pictures are rendered", () => {
  const d = S.seed("con");
  const find = (k) => d.sec.find((s) => s.k === k);
  Object.assign(find("services"), { al: "c", ly: "bento", bc: "#102030" });
  Object.assign(find("quotes"), { on: 1 });
  Object.assign(find("quotes").x, { pid: "ChIJTEST", key: "KEY" });
  Object.assign(find("pay"), { on: 1 });
  find("pay").i.push({ t: "PayFast", a: "", u: "https://payf.st/x", b: "Pay" });
  d.pg = { v: "data:image/jpeg;base64,AAAA", ov: 60 };
  d.hi = "data:image/jpeg;base64,AAAA";
  d.lay = { hero: "split" };
  const html = S.gen(d);
  for (const need of ["ly-bento", "al-c", 'id="gr"', "places.googleapis.com", 'class="pays"', "pgbg", 'class="hi"', "PayFast"]) assert.ok(html.includes(need), need);
});

test("older saved drafts are upgraded with the newer fields", () => {
  const d = S.seed("con");
  for (const k of ["lay", "btn", "dc", "pg", "hi"]) delete d[k];
  d.sec = d.sec.filter((s) => s.k !== "pay");
  S.fix(d);
  assert.ok(d.sec.some((s) => s.k === "pay") && d.dc && d.pg);
  assert.match(S.gen(d), /<footer/);
});

test("the foundation calculator prices measurements and distance", () => {
  const els = fakeDom();
  const q = S.seed("con").q;
  S.RT({ ...q, wa: "27821234567", em: "a@b.co" });
  assert.equal(money(els["#qs"].innerHTML), "R75 470");
  els["#q"].h.input({ target: { dataset: { m: "0" }, value: "20" } }); // length 10 m -> 20 m
  assert.equal(money(els["#qs"].innerHTML), "R150 670");
  assert.match(els["#qa"].href, /^https:\/\/wa\.me\/27821234567\?text=/);
});

test("shop mode shows product cards and the checkout link", () => {
  const els = fakeDom();
  const d = S.seed("ret");
  S.RT({ ...d.q, pay: "https://pay.example.com/x" });
  assert.equal(els["#qc"].className, "pg");
  assert.equal(els["#qa"].href, "https://pay.example.com/x");
});

test("Google reviews script asks Google once, escapes text and keeps the review links", async () => {
  const els = fakeDom();
  let called;
  globalThis.fetch = async (u, o) => (called = { u, o }, { json: async () => ({ rating: 4.6, userRatingCount: 12, reviews: [
    { rating: 5, text: { text: "Great <b>service</b>" }, authorAttribution: { displayName: "Sam", uri: "https://x" }, relativePublishTimeDescription: "a week ago" },
    { rating: 2, text: { text: "meh" } },
  ] }) });
  S.GR({ pid: "ChIJ", key: "K", proxy: "", max: 5, min: 4 });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(called.u.includes("places.googleapis.com/v1/places/ChIJ"));
  assert.equal(called.o.headers["X-Goog-Api-Key"], "K");
  const out = els["#gr"].innerHTML;
  assert.ok(out.includes("Sam") && !out.includes("meh") && !out.includes("<b>service") && out.includes("Write a Google review"));
  S.GR({ pid: "ChIJ", key: "", proxy: "https://p.example/r", max: 5, min: 1 });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(called.u.startsWith("https://p.example/r?pid=ChIJ"));
});

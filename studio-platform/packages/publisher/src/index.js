// Publish and pause steps. All I/O is injected, so the logic is unit tested without a network.

const hostsFor = (site, ctx) => [`${site.slug}.${ctx.baseDomain}`, ...(ctx.domains || [])].map((h) => h.toLowerCase());

/**
 * Render a site, store it, point every hostname at the new version.
 * @param {{id:string,slug:string,version?:number,draft:object}} site
 * @param {{licence:string,credit?:string,licenceUrl?:string,baseDomain:string,domains?:string[]}} ctx
 * @param {{render:(draft:object)=>string,putObject:(key:string,body:string,type:string)=>Promise<void>,putKV:(key:string,value:object)=>Promise<void>,saveDb:(patch:object)=>Promise<void>}} io
 */
export async function publishSite(site, ctx, io) {
  const draft = structuredClone(site.draft);
  draft.lic = ctx.licence;
  draft.credit = ctx.credit || "";
  draft.lurl = ctx.licenceUrl || "";
  const html = io.render(draft);
  const version = (site.version || 0) + 1;
  await io.putObject(`${site.slug}/${version}/index.html`, html, "text/html; charset=utf-8");
  const hosts = hostsFor(site, ctx);
  const rec = { site: site.slug, siteId: site.id, ver: version, status: "active" };
  await Promise.all(hosts.map((h) => io.putKV("host:" + h, rec)));
  await io.saveDb({ version, published: draft, status: "published", published_at: new Date().toISOString() });
  return { version, hosts, bytes: html.length };
}

/** Pause or resume a published site. The edge reads the status on every request. */
export async function setSiteStatus(site, ctx, status, io) {
  if (!site.version) return { hosts: [], changed: 0 };
  const hosts = hostsFor(site, ctx);
  const rec = { site: site.slug, siteId: site.id, ver: site.version, status };
  await Promise.all(hosts.map((h) => io.putKV("host:" + h, rec)));
  await io.saveDb({ status: status === "active" ? "published" : "paused" });
  return { hosts, changed: hosts.length };
}

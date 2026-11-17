import { NextResponse } from "next/server";
import { publishSite } from "@studio/publisher";
import { putKV, putObject, render } from "@/lib/publish";
import { adminClient, userClient } from "@/lib/supabase";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Row level security decides whether this user may see the site at all.
  const { data: site } = await supabase.from("sites").select("id, slug, version, draft, client_id").eq("id", id).single();
  if (!site) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const admin = adminClient();
  const { data: client } = await admin.from("clients").select("licence_key, status, remove_credit").eq("id", site.client_id).single();
  if (client?.status !== "active") return NextResponse.json({ error: "Account paused." }, { status: 403 });
  const { data: domains } = await admin.from("domains").select("hostname").eq("site_id", id).eq("status", "active");

  const result = await publishSite(
    site,
    {
      licence: client.licence_key,
      credit: client.remove_credit ? "" : `Powered by ${process.env.STUDIO_NAME}`,
      licenceUrl: process.env.LICENCE_URL,
      baseDomain: process.env.BASE_DOMAIN!,
      domains: (domains ?? []).map((d: { hostname: string }) => d.hostname),
    },
    {
      render,
      putObject,
      putKV,
      saveDb: async (patch: Record<string, unknown>) => {
        await admin.from("sites").update(patch).eq("id", id);
        await admin.from("audit_log").insert({ actor: user.id, action: "publish", target: id, meta: { version: patch.version } });
      },
    },
  );
  return NextResponse.json(result);
}

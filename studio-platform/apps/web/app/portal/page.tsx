import { userClient } from "@/lib/supabase";

// Client portal. Row level security returns only the sites this client may edit.
export default async function Portal() {
  const supabase = await userClient();
  const { data: sites } = await supabase.from("sites").select("id, company, niche, status, version").order("company");
  return (
    <main style={{ padding: 24 }}>
      <h1>Your websites</h1>
      <ul>
        {(sites ?? []).map((s: any) => (
          <li key={s.id}>{s.company} ({s.niche}), {s.status}, version {s.version}</li>
        ))}
      </ul>
      <p>TODO: port the prototype's editor here, using @studio/sitegen for the live preview.</p>
    </main>
  );
}

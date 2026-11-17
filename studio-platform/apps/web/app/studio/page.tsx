import { userClient } from "@/lib/supabase";

// Studio console. Row level security means only studio users get rows back.
export default async function Studio() {
  const supabase = await userClient();
  const { data: clients } = await supabase.from("clients").select("id, name, email, status, client_trades(trade_id)").order("name");
  return (
    <main style={{ padding: 24 }}>
      <h1>Studio console</h1>
      <ul>
        {(clients ?? []).map((c: any) => (
          <li key={c.id}>{c.name} ({c.email}), {c.status}: {c.client_trades.map((t: any) => t.trade_id).join(", ")}</li>
        ))}
      </ul>
      <p>TODO: port the prototype's client forms, requests and activity log here.</p>
    </main>
  );
}

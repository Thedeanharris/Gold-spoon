"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

export default function Login() {
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await supabase.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
    if (error) setMessage("Email or password not recognised.");
    else window.location.href = "/portal";
  }
  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <p><label>Email<br /><input name="email" type="email" required style={{ width: "100%" }} /></label></p>
        <p><label>Password<br /><input name="password" type="password" required style={{ width: "100%" }} /></label></p>
        <button type="submit">Sign in</button>
        <p>{message}</p>
      </form>
    </main>
  );
}

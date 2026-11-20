import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://arc-africa.onrender.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (origin && origin !== "https://arc-africa.onrender.com") return json({ error: "Origin not allowed" }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration incomplete" }, 500);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in required" }, 401);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user || user.email?.toLowerCase() !== "jarkpruden@gmail.com") {
    return json({ error: "Administrator access required" }, 403);
  }

  const admin = createClient(url, serviceKey);
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") return json({ error: "Administrator role is not enabled for this account yet" }, 403);

  // These privileged RPCs are intentionally service-role only; the browser never receives the service key.
  const { error: purgeError } = await admin.rpc("purge_arc_activity_audit_events");
  if (purgeError) console.error("Activity retention cleanup failed:", purgeError.message);

  const { data: sessions, error: sessionError } = await admin.rpc("admin_session_overview", { p_admin_user_id: user.id });
  if (sessionError) {
    console.error("Session overview failed:", sessionError.message);
    return json({ error: "Could not load session overview" }, 500);
  }

  const users: Record<string, unknown>[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return json({ error: "Could not load users" }, 500);
    for (const item of data.users) {
      users.push({
        id: item.id,
        email: item.email,
        created_at: item.created_at,
        last_sign_in_at: item.last_sign_in_at,
        email_confirmed_at: item.email_confirmed_at,
        banned_until: item.banned_until,
        role: item.app_metadata?.role || "user",
        app_metadata: { provider: item.app_metadata?.provider || "email" }
      });
    }
    if (data.users.length < 100) break;
  }

  await admin.from("admin_audit_events").insert({
    actor_id: user.id,
    action: "admin_console_viewed",
    target_type: "admin_console",
    details: { users_returned: users.length }
  });

  return json({ users, sessions: sessions || [], generated_at: new Date().toISOString() });
});

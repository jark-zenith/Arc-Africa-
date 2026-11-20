import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://arc-africa.onrender.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://arc-africa.onrender.com") return reply({ error: "Origin not allowed" }, 403);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply({ error: "Server configuration incomplete" }, 503);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply({ error: "Sign in required" }, 401);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply({ error: "Invalid session" }, 401);
  if (!user.email || !user.email_confirmed_at) return reply({ error: "Verify your email before linking an existing application." }, 403);

  const admin = createClient(url, serviceKey);
  const { data: ownApplication, error: ownError } = await admin
    .from("member_applications")
    .select("id,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (ownError) return reply({ error: "Could not check your existing application." }, 500);
  if (ownApplication) return reply({ ok: true, linked: false, application: ownApplication });

  const { data: candidates, error: candidateError } = await admin
    .from("member_applications")
    .select("id,status")
    .eq("email", user.email.toLowerCase())
    .is("user_id", null)
    .order("created_at", { ascending: false })
    .limit(2);
  if (candidateError) return reply({ error: "Could not check for an earlier application." }, 500);
  if (!candidates?.length) return reply({ ok: true, linked: false, application: null });
  if (candidates.length > 1) return reply({ error: "More than one earlier application matches this email. Contact the community team so it can be linked safely." }, 409);

  const candidate = candidates[0];
  const { data: linkedApplication, error: linkError } = await admin
    .from("member_applications")
    .update({ user_id: user.id, status: candidate.status })
    .eq("id", candidate.id)
    .is("user_id", null)
    .select("id,status")
    .maybeSingle();
  if (linkError) return reply({ error: "Could not link the earlier application to this account." }, 500);
  if (!linkedApplication) return reply({ error: "The application changed while it was being linked. Refresh and try again." }, 409);

  return reply({ ok: true, linked: true, application: linkedApplication });
});

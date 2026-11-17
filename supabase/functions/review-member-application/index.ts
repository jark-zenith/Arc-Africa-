import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mailKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ARC_AFRICA_FROM_EMAIL");
  const site = Deno.env.get("ARC_AFRICA_SITE_URL") || "https://arc-africa.onrender.com";
  if (!url || !anon || !adminKey) return reply({ error: "Server authentication is not configured." }, 503);

  const auth = req.headers.get("Authorization");
  if (!auth) return reply({ error: "Sign in required" }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply({ error: "Invalid session" }, 401);

  const admin = createClient(url, adminKey);
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError || !["moderator", "admin"].includes(profile?.role || "")) {
    return reply({ error: "Moderator access required" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.application_id || "");
  const decision = String(body.decision || "");
  const note = String(body.note || "").slice(0, 1200);
  if (!id || !["approved", "rejected", "changes_requested"].includes(decision)) {
    return reply({ error: "Invalid review request" }, 400);
  }

  const { data: app, error: appError } = await admin.from("member_applications").select("*").eq("id", id).maybeSingle();
  if (appError || !app) return reply({ error: "Application not found" }, 404);
  if (!["pending", "changes_requested"].includes(app.status)) {
    return reply({ error: "Application is no longer pending" }, 409);
  }

  let memberId = app.user_id || null;
  let link = "";
  let emailError = "";
  const emailConfigured = Boolean(mailKey && from);

  // Create the sign-in link before the status update when email is configured.
  // Link-generation failure must not block the moderator's decision.
  if (decision === "approved" && emailConfigured) {
    const linkType = memberId ? "magiclink" : "invite";
    const generated = await admin.auth.admin.generateLink({
      type: linkType,
      email: app.email,
      options: {
        redirectTo: site + "/?welcome=1",
        ...(linkType === "invite" ? { data: { display_name: app.applicant_name, membership_status: "approved" } } : {})
      }
    });
    if (generated.error || !generated.data?.properties?.action_link) {
      emailError = "Could not generate a secure sign-in link.";
    } else {
      link = generated.data.properties.action_link;
      memberId = generated.data.user?.id || memberId;
    }
  } else if (!emailConfigured) {
    emailError = "Approval email is not configured (RESEND_API_KEY and ARC_AFRICA_FROM_EMAIL are required).";
  }

  // Persist the decision first. A mail-provider outage must never undo or block moderation.
  const reviewedAt = new Date().toISOString();
  const { error: updateError } = await admin.from("member_applications").update({
    status: decision,
    user_id: memberId,
    moderator_note: note,
    reviewed_by: user.id,
    reviewed_at: reviewedAt
  }).eq("id", id);
  if (updateError) return reply({ error: "Could not save the application decision." }, 500);

  if (decision === "approved" && memberId) {
    const { error: memberError } = await admin.from("profiles").update({
      membership_status: "approved",
      display_name: app.applicant_name
    }).eq("id", memberId);
    if (memberError) emailError = emailError || "Membership was approved, but the profile status could not be synchronized.";
  }

  let emailSent = false;
  if (emailConfigured && !emailError) {
    const subject = decision === "approved"
      ? "You’re approved to join Arc Africa"
      : decision === "rejected"
        ? "Update on your Arc Africa application"
        : "More information needed for your Arc Africa application";
    const intro = decision === "approved"
      ? "Your application has been reviewed and approved. Use the secure link below to enter the Arc Africa community."
      : decision === "rejected"
        ? "Thank you for applying. After review, we are unable to approve this application at this time."
        : "Your application needs a little more information before we can make a decision.";
    const button = link
      ? '<p><a href="' + escapeHtml(link) + '" style="display:inline-block;padding:14px 20px;background:#318cff;color:#fff;text-decoration:none;border-radius:8px">Open Arc Africa securely</a></p>'
      : "";
    const safeNote = escapeHtml(note);
    const html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#182735">' +
      '<p style="letter-spacing:2px;color:#318cff;font-weight:bold">ARC AFRICA · KENYA</p>' +
      "<h1>" + escapeHtml(subject) + "</h1><p>Hello " + escapeHtml(app.applicant_name) + ",</p>" +
      "<p>" + escapeHtml(intro) + "</p>" + button +
      (safeNote ? "<p><b>Moderator note:</b> " + safeNote + "</p>" : "") +
      "<p>Arc Africa is a community for people who learn, build and collaborate with commitment.</p>" +
      "<p>— Arc Africa Community Team</p></div>";
    try {
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + mailKey, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [app.email], subject, html })
      });
      if (sent.ok) emailSent = true;
      else emailError = "The decision was saved, but the email provider rejected the notification.";
    } catch {
      emailError = "The decision was saved, but the email provider could not be reached.";
    }
  }

  return reply({ ok: true, email_sent: emailSent, email_error: emailError || undefined, decision });
});

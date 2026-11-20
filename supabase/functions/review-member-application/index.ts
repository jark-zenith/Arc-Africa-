import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://arc-africa.onrender.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const origin = req.headers.get("Origin");
  if (origin && origin !== "https://arc-africa.onrender.com") return reply({ error: "Origin not allowed" }, 403);

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
  const retry = body.action === "retry_notification";
  const requestedDecision = String(body.decision || "");
  const note = String(body.note || "").slice(0, 1200);
  if (!id || (!retry && !["approved", "rejected", "changes_requested"].includes(requestedDecision))) {
    return reply({ error: "Invalid review request" }, 400);
  }

  const { data: app, error: appError } = await admin.from("member_applications").select("*").eq("id", id).maybeSingle();
  if (appError || !app) return reply({ error: "Application not found" }, 404);

  const decision = retry ? app.status : requestedDecision;
  if (!["approved", "rejected", "changes_requested"].includes(decision)) {
    return reply({ error: "There is no completed decision to notify." }, 409);
  }
  if (!retry && !["pending", "changes_requested"].includes(app.status)) {
    return reply({ error: "Application is no longer pending" }, 409);
  }

  const { data: previousDelivery } = await admin
    .from("member_application_email_delivery")
    .select("status,attempt_count")
    .eq("application_id", id)
    .eq("decision", decision)
    .maybeSingle();

  if (retry && previousDelivery?.status === "sent") {
    return reply({ ok: true, email_sent: true, already_sent: true, decision });
  }

  let memberId = app.user_id || null;
  let link = "";

  // Approval must provision a real account/link before the decision is committed.
  // Email-provider configuration is separate: a missing mail service must not
  // create an approved application with no user account attached.
  if (decision === "approved") {
    const linkOptions = {
      redirectTo: site + "/?welcome=1",
      data: { display_name: app.applicant_name, membership_status: "approved" }
    };
    // A person may have applied anonymously and created an account before review.
    // Try a magic link first so an existing Auth user is linked; only invite if
    // Supabase confirms there is no existing user for this email.
    let generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: app.email,
      options: { redirectTo: linkOptions.redirectTo }
    });
    if (generated.error && !memberId) {
      generated = await admin.auth.admin.generateLink({
        type: "invite",
        email: app.email,
        options: linkOptions
      });
    }
    if (generated.error || !generated.data?.properties?.action_link) {
      return reply({ error: "Could not prepare the secure member sign-in link. No new approval decision was saved; retry after checking Auth configuration." }, 502);
    }
    link = generated.data.properties.action_link;
    memberId = generated.data.user?.id || memberId;
  }

  if (!retry) {
    const { error: updateError } = await admin.from("member_applications").update({
      status: decision,
      user_id: memberId,
      moderator_note: note,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString()
    }).eq("id", id);
    if (updateError) return reply({ error: "Could not save the application decision." }, 500);
  } else if (decision === "approved" && memberId && memberId !== app.user_id) {
    const { error: attachError } = await admin.from("member_applications").update({ user_id: memberId }).eq("id", id);
    if (attachError) return reply({ error: "The member account was created but could not be attached to the application. Retry the notification after resolving the database error." }, 500);
  }

  if (decision === "approved" && memberId) {
    const { error: memberError } = await admin.from("profiles").update({
      membership_status: "approved",
      display_name: app.applicant_name
    }).eq("id", memberId);
    if (memberError) {
      const message = "Membership was approved, but the member profile could not be synchronized: " + memberError.message;
      await admin.from("member_application_email_delivery").upsert({
        application_id: id, decision, status: "failed",
        attempt_count: (previousDelivery?.attempt_count || 0) + 1,
        last_error: message, attempted_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, { onConflict: "application_id,decision" });
      return reply({ ok: true, email_sent: false, email_error: message, decision }, 200);
    }
  }

  const attemptedAt = new Date().toISOString();
  const attemptCount = (previousDelivery?.attempt_count || 0) + 1;
  const { error: deliveryStartError } = await admin.from("member_application_email_delivery").upsert({
    application_id: id,
    decision,
    status: "pending",
    attempt_count: attemptCount,
    last_error: null,
    attempted_at: attemptedAt,
    sent_at: null,
    updated_at: attemptedAt
  }, { onConflict: "application_id,decision" });
  if (deliveryStartError) {
    return reply({ ok: true, email_sent: false, email_error: "The moderation decision is saved, but the email delivery record could not be created. No email was sent." }, 200);
  }

  let emailError = "";
  if (!mailKey || !from) {
    emailError = "Email delivery is not configured. Set RESEND_API_KEY and ARC_AFRICA_FROM_EMAIL in the Edge Function secrets.";
  } else {
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
    const safeNote = escapeHtml(retry ? app.moderator_note : note);
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
      if (!sent.ok) emailError = "The decision was saved, but the email provider rejected the notification.";
    } catch {
      emailError = "The decision was saved, but the email provider could not be reached.";
    }
  }

  const deliveredAt = new Date().toISOString();
  const { error: deliveryUpdateError } = await admin.from("member_application_email_delivery").update({
    status: emailError ? "failed" : "sent",
    last_error: emailError || null,
    sent_at: emailError ? null : deliveredAt,
    updated_at: deliveredAt
  }).eq("application_id", id).eq("decision", decision);

  if (deliveryUpdateError) {
    return reply({
      ok: true,
      email_sent: !emailError,
      email_error: emailError || "The email provider accepted the message, but delivery status could not be recorded. Check the delivery log before retrying.",
      decision
    }, 200);
  }

  return reply({ ok: true, email_sent: !emailError, email_error: emailError || undefined, decision, attempt_count: attemptCount });
});

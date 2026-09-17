function deadlineTimestamp(dateIso) {
  return new Date(`${dateIso}T17:00:00-05:00`).getTime();
}

function supabaseHeaders() {
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function getInProgressBriefs() {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/marketing_briefs?status=eq.in_progress&select=*`;
  const resp = await fetch(url, { headers: supabaseHeaders() });
  if (!resp.ok) throw new Error(`Supabase fetch failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// Pulls the real, admin-configured recipients — the old hardcoded map here was from before
// Marketing had a proper notify-emails table and 3 Diseño slots, and never got updated.
async function getNotifyEmails() {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/marketing_notify_emails?select=role,email`;
  const resp = await fetch(url, { headers: supabaseHeaders() });
  if (!resp.ok) throw new Error(`Supabase fetch failed: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  const map = {};
  rows.forEach((r) => { if (r.email) map[r.role] = r.email; });
  return map;
}

async function updateBriefStages(id, stages) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/marketing_briefs?id=eq.${id}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({ stages }),
  });
  if (!resp.ok) throw new Error(`Supabase update failed: ${resp.status} ${await resp.text()}`);
}

async function getGraphToken() {
  const tenantId = process.env.AZURE_MAILER_TENANT_ID;
  const clientId = process.env.AZURE_MAILER_CLIENT_ID;
  const clientSecret = process.env.AZURE_MAILER_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Azure mailer credentials not configured");
  }

  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Azure token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sendGraphMail(to, subject, html) {
  const sender = process.env.MAIL_SENDER_ADDRESS;
  if (!sender) throw new Error("MAIL_SENDER_ADDRESS not configured");

  const token = await getGraphToken();
  const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  });

  if (resp.status !== 202) {
    const text = await resp.text();
    throw new Error(`sendMail failed: ${resp.status} ${text}`);
  }
}

export const handler = async (event) => {
  const secret = process.env.CRON_SECRET;
  if (secret && event.headers?.["x-cron-secret"] !== secret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let briefs, notifyEmails;
  try {
    [briefs, notifyEmails] = await Promise.all([getInProgressBriefs(), getNotifyEmails()]);
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  const now = Date.now();
  const in24h = now + 24 * 3600 * 1000;
  let sent = 0;

  for (const brief of briefs ?? []) {
    const stages = brief.stages ?? [];
    const idx = stages.findIndex((s) => s.key === brief.current_stage);
    if (idx === -1) continue;
    const stage = stages[idx];
    if (stage.status !== "pending" || stage.reminded24h) continue;

    const deadlineMs = deadlineTimestamp(stage.deadline);
    if (deadlineMs < now || deadlineMs > in24h) continue;

    // Laura always gets her own configured address; Diseño reminders go to whoever this brief
    // is actually assigned to. If somehow still unassigned, this follows the same rule as
    // everywhere else in Marketing: Karol gets notified to assign it (not a broadcast to all 3) —
    // the 24h auto-assign job takes over from there if she doesn't.
    let recipients = [];
    if (stage.role === "laura") {
      if (notifyEmails.laura) recipients = [notifyEmails.laura];
    } else if (stage.role === "diseno") {
      if (brief.assigned_diseno_email) {
        recipients = [brief.assigned_diseno_email];
      } else if (notifyEmails.carol) {
        recipients = [notifyEmails.carol];
      }
    }
    if (recipients.length === 0) continue;

    try {
      for (const email of recipients) {
        await sendGraphMail(
          email,
          `Faltan 24 horas — ${brief.reference}`,
          `<div style="font-family:-apple-system,sans-serif;color:#2C2A20;">
            <p>Faltan 24 horas para completar tu tarea.</p>
            <p><strong>Referencia:</strong> ${brief.reference}</p>
            <p><strong>Tarea:</strong> ${stage.label}</p>
            <p><strong>Deadline:</strong> ${stage.deadline}, 5:00 PM hora de Colombia</p>
            <p style="color:#6B6350;font-size:12px;">FTC Hub — Marketing</p>
          </div>`,
        );
      }
      sent++;
      const newStages = stages.map((s, i) => (i === idx ? { ...s, reminded24h: true } : s));
      await updateBriefStages(brief.id, newStages);
    } catch (err) {
      console.error(`Failed to send reminder for brief ${brief.id}:`, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ checked: briefs?.length ?? 0, sent }) };
};

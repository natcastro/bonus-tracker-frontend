function supabaseHeaders() {
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function sbFetch(path) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`;
  const resp = await fetch(url, { headers: supabaseHeaders() });
  if (!resp.ok) throw new Error(`Supabase fetch failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function updateBrief(id, patch) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/marketing_briefs?id=eq.${id}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) throw new Error(`Supabase update failed: ${resp.status} ${await resp.text()}`);
}

async function insertNotification(briefId, message) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/marketing_notifications`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({ brief_id: briefId, message }),
  });
  if (!resp.ok) throw new Error(`Supabase insert failed: ${resp.status} ${await resp.text()}`);
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] },
    }),
  });

  if (resp.status !== 202) {
    const text = await resp.text();
    throw new Error(`sendMail failed: ${resp.status} ${text}`);
  }
}

function emailHtml(intro, reference) {
  return `<div style="font-family:-apple-system,sans-serif;color:#2C2A20;">
    <p>${intro}</p>
    <p><strong>Referencia:</strong> ${reference}</p>
    <p style="color:#6B6350;font-size:12px;">FTC Hub — Marketing</p>
  </div>`;
}

// Round-robin among the 3 configured Diseño emails: whoever has the fewest briefs ever
// assigned to them (across the brief's whole history) gets the next unassigned one.
function pickNextDiseno(disenoEmails, allAssignedEmails) {
  const counts = disenoEmails.map(email => allAssignedEmails.filter(e => e === email).length);
  let minIdx = 0;
  for (let i = 1; i < counts.length; i++) if (counts[i] < counts[minIdx]) minIdx = i;
  return disenoEmails[minIdx];
}

export const handler = async (event) => {
  const secret = process.env.CRON_SECRET;
  if (secret && event.headers?.["x-cron-secret"] !== secret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let briefs, notifyEmailRows, history;
  try {
    [briefs, notifyEmailRows, history] = await Promise.all([
      sbFetch("marketing_briefs?status=eq.in_progress&assigned_diseno_email=is.null&carol_notified_at=not.is.null&select=*"),
      sbFetch("marketing_notify_emails?select=*"),
      sbFetch("marketing_briefs?assigned_diseno_email=not.is.null&select=assigned_diseno_email"),
    ]);
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  const notifyMap = {};
  notifyEmailRows.forEach(r => { notifyMap[r.role] = r.email; });
  const disenoEmails = [notifyMap.diseno_1, notifyMap.diseno_2, notifyMap.diseno_3].filter(Boolean);
  if (disenoEmails.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ checked: briefs.length, assigned: 0, note: "No Diseño emails configured" }) };
  }

  const now = Date.now();
  const assignedEmailHistory = history.map(r => r.assigned_diseno_email);
  let assigned = 0;

  for (const brief of briefs) {
    const notifiedAt = new Date(brief.carol_notified_at).getTime();
    if (now - notifiedAt < 24 * 3600 * 1000) continue;

    const email = pickNextDiseno(disenoEmails, assignedEmailHistory);
    assignedEmailHistory.push(email); // so the next brief in this same run doesn't pick the same person

    try {
      await updateBrief(brief.id, { assigned_diseno_email: email, carol_notified_at: null });
      await insertNotification(brief.id, `Se asignó automáticamente ${brief.reference} a Diseño — Carol no lo asignó a tiempo.`);
      await sendGraphMail(
        email,
        `Te asignaron un brief — ${brief.reference}`,
        emailHtml("Se te asignó este brief automáticamente porque no fue asignado a tiempo.", brief.reference),
      );
      assigned++;
    } catch (err) {
      console.error(`Failed to auto-assign brief ${brief.id}:`, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ checked: briefs.length, assigned }) };
};

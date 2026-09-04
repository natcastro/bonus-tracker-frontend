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

function deadlineTimestamp(dateIso) {
  return new Date(`${dateIso}T17:00:00-05:00`).getTime();
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

export const handler = async (event) => {
  const secret = process.env.CRON_SECRET;
  if (secret && event.headers?.["x-cron-secret"] !== secret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let drafts, notifyEmailRows;
  try {
    [drafts, notifyEmailRows] = await Promise.all([
      sbFetch("marketing_briefs?status=eq.draft&publish_reminded_12h=eq.false&select=*"),
      sbFetch("marketing_notify_emails?role=eq.laura&select=*"),
    ]);
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  const lauraEmail = notifyEmailRows[0]?.email;
  if (!lauraEmail) {
    return { statusCode: 200, body: JSON.stringify({ checked: drafts.length, sent: 0, note: "No Laura email configured" }) };
  }

  const now = Date.now();
  const in12h = now + 12 * 3600 * 1000;
  let sent = 0;

  for (const brief of drafts) {
    if (!brief.estimated_start_date) continue;
    const target = deadlineTimestamp(brief.estimated_start_date);
    if (target < now || target > in12h) continue;

    try {
      await sendGraphMail(
        lauraEmail,
        `Recordatorio — publica ${brief.reference}`,
        `<div style="font-family:-apple-system,sans-serif;color:#2C2A20;">
          <p>Esta es tu fecha estimada de inicio para esta tarea pendiente. No se te olvide publicarla.</p>
          <p><strong>Referencia:</strong> ${brief.reference}</p>
          <p><strong>Fecha estimada:</strong> ${brief.estimated_start_date}</p>
          <p style="color:#6B6350;font-size:12px;">FTC Hub — Marketing</p>
        </div>`,
      );
      await updateBrief(brief.id, { publish_reminded_12h: true });
      sent++;
    } catch (err) {
      console.error(`Failed to send publish reminder for brief ${brief.id}:`, err.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ checked: drafts.length, sent }) };
};

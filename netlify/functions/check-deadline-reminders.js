// Scheduled deadline alerts for Briefs (Laura <-> Diseño) and To Do tasks (Karol <-> Diseño).
// Triggered every 15 min by .github/workflows/marketing-24h-reminders.yml.
//
// Sends one email at each of four tiers relative to the current stage's deadline — 24h, 12h and
// 1h before, then once per hour while overdue — and never resends a tier once its "sent" marker
// is written back onto that stage. Reminders stop on their own once a brief/task is no longer
// "in_progress" or has moved past that stage, since the query below only looks at the live one.

const SITE_URL = process.env.URL || "https://transcendent-axolotl-027557.netlify.app";

// Must match deadlineTimestamp() in src/pages/marketing/types.ts.
function deadlineTimestamp(dateIso) {
  return new Date(`${dateIso}T18:30:00-05:00`).getTime();
}

function formatDeadlineHuman(dateIso) {
  const d = new Date(`${dateIso}T00:00:00-05:00`);
  return `${d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" })}, 6:30 PM hora de Colombia`;
}

function formatDuration(ms) {
  const abs = Math.abs(ms);
  const totalMinutes = Math.max(1, Math.round(abs / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

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

async function patchStages(table, id, stages) {
  const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
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

function reminderEmailHtml({ overdue, taskName, stageLabel, deadline, remainingMs, responsibleName, link }) {
  const timeLine = overdue
    ? `<p><strong>Atrasada por:</strong> ${formatDuration(remainingMs)}</p>`
    : `<p><strong>Tiempo restante:</strong> ${formatDuration(remainingMs)}</p>`;
  return `
    <div style="font-family:-apple-system,sans-serif;color:#2C2A20;">
      <p>${overdue ? "Esta tarea está <strong>atrasada</strong>." : "Recordatorio de fecha límite."}</p>
      <p><strong>Tarea:</strong> ${taskName}</p>
      <p><strong>Etapa:</strong> ${stageLabel}</p>
      <p><strong>Deadline:</strong> ${deadline}</p>
      ${timeLine}
      <p><strong>Responsable:</strong> ${responsibleName}</p>
      <p><a href="${link}" style="color:#3E6B4F;font-weight:700;">Ver tarea en FTC Hub →</a></p>
      <p style="color:#6B6350;font-size:12px;">FTC Hub — Marketing</p>
    </div>
  `;
}

function reminderSubject(overdue, tierHours, taskName) {
  if (overdue) return `⚠ Atrasada — ${taskName}`;
  return `Faltan ${tierHours}h — ${taskName}`;
}

// Exactly one tier applies per stage per run, even if a cron gap let remaining time skip past
// a tier entirely — it just lands in whichever window it's actually in right now.
function pickTier(remainingMs, stage) {
  const HOUR = 3_600_000;
  if (remainingMs <= 0) {
    if (!stage.overdueLastRemindAt || Date.now() - new Date(stage.overdueLastRemindAt).getTime() >= HOUR) {
      return "overdue";
    }
    return null;
  }
  if (remainingMs <= HOUR) return stage.remind1hAt ? null : "1h";
  if (remainingMs <= 12 * HOUR) return stage.remind12hAt ? null : "12h";
  if (remainingMs <= 24 * HOUR) return stage.remind24hAt ? null : "24h";
  return null;
}

function markStage(stage, tier) {
  const now = new Date().toISOString();
  if (tier === "24h") return { ...stage, remind24hAt: now };
  if (tier === "12h") return { ...stage, remind12hAt: now };
  if (tier === "1h") return { ...stage, remind1hAt: now };
  return { ...stage, overdueLastRemindAt: now };
}

async function resolveRecipient(entity, stage, notifyEmails) {
  if (stage.role === "laura") return notifyEmails.laura || null;
  if (stage.role === "carol") return notifyEmails.carol || null;
  if (stage.role === "diseno") return entity.assigned_diseno_email || notifyEmails.carol || null;
  return null;
}

async function getNicknames(emails) {
  const clean = Array.from(new Set(emails.filter(Boolean).map(e => e.toLowerCase())));
  if (clean.length === 0) return {};
  const rows = await sbFetch(`hub_access?email=in.(${clean.map(e => `"${e}"`).join(",")})&select=email,nickname`);
  const map = {};
  rows.forEach(r => { if (r.nickname) map[r.email.toLowerCase()] = r.nickname; });
  return map;
}

function responsibleName(role, email, nicknames) {
  if (role === "laura") return nicknames[(email || "").toLowerCase()] || "Laura";
  if (role === "carol") return nicknames[(email || "").toLowerCase()] || "Karol";
  return nicknames[(email || "").toLowerCase()] || email || "Diseño";
}

async function processEntities({ table, rows, idPrefix, taskNameOf, stageLabelOf, notifyEmails, nicknames }) {
  let sent = 0;
  for (const entity of rows) {
    const stages = entity.stages ?? [];
    const idx = stages.findIndex(s => s.key === entity.current_stage);
    if (idx === -1) continue;
    const stage = stages[idx];
    if (stage.status !== "pending" || !stage.deadline) continue;

    const deadlineMs = deadlineTimestamp(stage.deadline);
    const remainingMs = deadlineMs - Date.now();
    const tier = pickTier(remainingMs, stage);
    if (!tier) continue;

    const recipient = await resolveRecipient(entity, stage, notifyEmails);
    if (!recipient) continue;

    const taskName = taskNameOf(entity);
    const link = `${SITE_URL}/marketing/${idPrefix}/${entity.id}`;
    const overdue = tier === "overdue";
    const tierHours = tier === "24h" ? 24 : tier === "12h" ? 12 : 1;

    try {
      await sendGraphMail(
        recipient,
        reminderSubject(overdue, tierHours, taskName),
        reminderEmailHtml({
          overdue,
          taskName,
          stageLabel: stageLabelOf(stage),
          deadline: formatDeadlineHuman(stage.deadline),
          remainingMs,
          responsibleName: responsibleName(stage.role, recipient, nicknames),
          link,
        }),
      );
      const newStages = stages.map((s, i) => (i === idx ? markStage(s, tier) : s));
      await patchStages(table, entity.id, newStages);
      sent++;
    } catch (err) {
      console.error(`Failed to send ${tier} reminder for ${table} ${entity.id}:`, err.message);
    }
  }
  return sent;
}

export const handler = async (event) => {
  const secret = process.env.CRON_SECRET;
  if (secret && event.headers?.["x-cron-secret"] !== secret) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  let briefs, todoTasks, notifyEmailRows;
  try {
    [briefs, todoTasks, notifyEmailRows] = await Promise.all([
      sbFetch("marketing_briefs?status=eq.in_progress&select=*"),
      sbFetch("marketing_todo_tasks?status=eq.in_progress&select=*"),
      sbFetch("marketing_notify_emails?select=role,email"),
    ]);
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  const notifyEmails = {};
  notifyEmailRows.forEach(r => { if (r.email) notifyEmails[r.role] = r.email; });

  const candidateEmails = [
    notifyEmails.laura, notifyEmails.carol,
    ...briefs.map(b => b.assigned_diseno_email),
    ...todoTasks.map(t => t.assigned_diseno_email),
  ];
  let nicknames;
  try {
    nicknames = await getNicknames(candidateEmails);
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  let sent = 0;
  try {
    sent += await processEntities({
      table: "marketing_briefs",
      rows: briefs,
      idPrefix: "brief",
      taskNameOf: b => b.reference,
      stageLabelOf: s => s.label,
      notifyEmails,
      nicknames,
    });
    sent += await processEntities({
      table: "marketing_todo_tasks",
      rows: todoTasks,
      idPrefix: "todo",
      taskNameOf: t => t.title,
      stageLabelOf: s => s.label,
      notifyEmails,
      nicknames,
    });
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ checkedBriefs: briefs.length, checkedTodo: todoTasks.length, sent }) };
};

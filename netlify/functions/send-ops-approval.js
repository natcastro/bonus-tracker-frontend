import crypto from "node:crypto";

const TENANT_ID = "e2f6e61f-1d89-4193-82a7-b62dae532dc1";
const CLIENT_ID = "369c616f-761a-4533-bdb7-bd6ddd9359b4";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });
const b64 = (s) => Buffer.from(s, "base64url");

// Verifies a Microsoft Entra ID token (signature, issuer, audience, expiry) and returns its claims.
async function verifyIdToken(token) {
  const [h, p, sig] = String(token || "").split(".");
  if (!h || !p || !sig) throw new Error("Malformed token");
  const header = JSON.parse(b64(h).toString());
  const claims = JSON.parse(b64(p).toString());
  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");

  const keys = await (await fetch(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`)).json();
  const jwk = (keys.keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Signing key not found");
  const ok = crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: "jwk" }), b64(sig));
  if (!ok) throw new Error("Invalid token signature");

  if (claims.iss !== `https://login.microsoftonline.com/${TENANT_ID}/v2.0`) throw new Error("Wrong issuer");
  if (claims.aud !== CLIENT_ID) throw new Error("Wrong audience");
  const now = Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp < now) throw new Error("Token expired");
  // Must come from the forced re-login the user just did, not an old session.
  if (!claims.iat || now - claims.iat > 600) throw new Error("Please sign in again to approve");
  return claims;
}

function supa(path, init = {}) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

async function getGraphToken() {
  const { AZURE_MAILER_TENANT_ID: t, AZURE_MAILER_CLIENT_ID: c, AZURE_MAILER_CLIENT_SECRET: s } = process.env;
  if (!t || !c || !s) throw new Error("Azure mailer credentials not configured");
  const resp = await fetch(`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c, client_secret: s, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Azure token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sendGraphMail(to, cc, subject, html) {
  const sender = process.env.MAIL_SENDER_ADDRESS;
  if (!sender) throw new Error("MAIL_SENDER_ADDRESS not configured");
  const token = await getGraphToken();
  const resp = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        ccRecipients: cc ? [{ emailAddress: { address: cc } }] : [],
      },
    }),
  });
  if (resp.status !== 202) throw new Error(`sendMail failed: ${resp.status} ${await resp.text()}`);
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON body" }); }

  const { idToken, year, cycleId, periodLabel, team, agents } = body;
  if (!idToken || !Array.isArray(agents) || !agents.length) return json(400, { error: "Missing data" });

  let claims;
  try { claims = await verifyIdToken(idToken); } catch (e) { return json(401, { error: e.message }); }
  const signedInAs = String(claims.preferred_username || claims.email || "").toLowerCase().trim();

  const sres = await supa("ops_approval_settings?id=eq.1&select=*");
  const settings = (await sres.json())?.[0];
  const approver = String(settings?.approver_email || "").toLowerCase().trim();
  const hr = String(settings?.hr_email || "").trim();
  const copy = String(settings?.copy_email || "").trim();
  if (!approver || !hr) return json(400, { error: "Approval settings are not configured yet." });
  if (signedInAs !== approver) return json(403, { error: `${signedInAs || "This account"} is not authorized to approve.` });

  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  const blocks = agents.map((a) => `
    <h3 style="margin:24px 0 8px;color:#0F172A">${esc(a.name)}</h3>
    <table style="border-collapse:collapse;width:100%;max-width:520px;font-size:14px">
      ${(a.rows || []).map((r) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #E2E8F0">${esc(r.label)}${r.cap ? ` <span style="color:#64748B;font-size:12px">(cap ${esc(money(r.cap))})</span>` : ""}</td><td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;text-align:right">${esc(money(r.amount))}</td></tr>`).join("")}
      <tr><td style="padding:8px 10px;font-weight:700">Total${a.totalCap ? ` <span style="color:#64748B;font-size:12px;font-weight:400">(cap ${esc(money(a.totalCap))})</span>` : ""}</td><td style="padding:8px 10px;text-align:right;font-weight:700">${esc(money(a.total))}</td></tr>
    </table>`).join("");

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F172A">
    <h2 style="margin:0 0 4px">Bonus breakdown — ${esc(team || "Operations")}</h2>
    <p style="margin:0;color:#475569">Period: <strong>${esc(periodLabel)}</strong></p>
    ${blocks}
    <p style="margin-top:28px;color:#64748B;font-size:12px">Approved by ${esc(signedInAs)} in FTC Hub on ${esc(new Date().toISOString().slice(0, 10))}.</p>
  </div>`;

  try {
    await sendGraphMail(hr, copy, `Bonus breakdown — ${team || "Operations"} — ${periodLabel}`, html);
  } catch (e) { return json(500, { error: e.message }); }

  const total = agents.reduce((s, a) => s + Number(a.total || 0), 0);
  await supa("ops_approvals", { method: "POST", body: JSON.stringify({ year: Number(year), cycle_id: String(cycleId), approved_by: signedInAs, sent_to: hr, total_amount: total }) }).catch(() => {});
  return json(200, { ok: true, sentTo: hr, approvedBy: signedInAs });
};

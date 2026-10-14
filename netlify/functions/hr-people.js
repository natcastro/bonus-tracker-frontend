import crypto from "node:crypto";

const TENANT_ID = "e2f6e61f-1d89-4193-82a7-b62dae532dc1";
const CLIENT_ID = "369c616f-761a-4533-bdb7-bd6ddd9359b4";

const json = (statusCode, obj) => ({ statusCode, headers: { "Cache-Control": "no-store" }, body: JSON.stringify(obj) });
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
  if (!crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: "jwk" }), b64(sig))) throw new Error("Invalid token signature");
  if (claims.iss !== `https://login.microsoftonline.com/${TENANT_ID}/v2.0`) throw new Error("Wrong issuer");
  if (claims.aud !== CLIENT_ID) throw new Error("Wrong audience");
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return claims;
}

function supa(path, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

const norm = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// What this person may see: the Hub's main admin, William (HR) and Erika (accounting) see everyone;
// a supervisor sees their team (+ their own pay if they also bill); a contractor sees only themselves.
function scopeFor(access, all) {
  const teams = access.teams || [];
  const full = access.is_admin || teams.includes("ALL") || teams.includes("HR") || teams.includes("HR:admin") || teams.includes("HR:accounting");
  if (full) return { ...all, canEdit: access.is_admin || teams.includes("ALL") || teams.includes("HR") || teams.includes("HR:admin") };
  const nick = norm(access.nickname);
  const sup = teams.includes("HR:supervisor") ? all.supervisors.find((s) => norm(`${s.firstName} ${s.lastName}`) === nick) : null;
  const mine = all.contractors.find((c) => norm(c.legalName) === nick && teams.includes("HR:staff"));
  const contractors = all.contractors.filter((c) => (sup && (c.supervisorId === sup.id || c.id === sup.contractorId)) || (mine && c.id === mine.id));
  if (contractors.length === 0 && !sup) return null;
  return { contractors, supervisors: all.supervisors, canEdit: false };
}

const isHead = (n) => /^will?i?am\s+calle/.test(norm(n));

// Every HR person gets a row in Hub Access (so the main admin sees them in "Usuarios" and can open "Ver como"):
// a made-up address prueba1@formatucuerpo.com… until their real company email is set. Idempotent.
async function ensureAccessRows(all) {
  const r = await supa("hub_access?select=email,teams,nickname");
  const existing = r.ok ? await r.json() : [];
  let n = Math.max(0, ...existing.map((e) => Number(/^prueba(\d+)@formatucuerpo\.com$/.exec(e.email)?.[1] ?? 0)));
  const wanted = [
    { role: "admin", nick: "William Calle — HR" },
    { role: "accounting", nick: "Erika — Contabilidad" },
    ...all.supervisors.filter((s) => !isHead(`${s.firstName} ${s.lastName}`)).map((s) => ({ role: "supervisor", nick: `${s.firstName} ${s.lastName}`.trim() })),
    ...all.contractors.filter((c) => !isHead(c.legalName)).map((c) => ({ role: "staff", nick: c.legalName })),
  ];
  const rows = [];
  for (const w of wanted) {
    if (existing.some((e) => (e.teams || []).includes(`HR:${w.role}`) && e.nickname === w.nick)) continue;
    n += 1;
    rows.push({ email: `prueba${n}@formatucuerpo.com`, teams: [`HR:${w.role}`], is_admin: false, nickname: w.nick });
  }
  if (rows.length) await supa("hub_access", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) });
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_SUPABASE_URL) return json(500, { error: "Server not configured" });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }

  let claims;
  try { claims = await verifyIdToken(body.idToken); } catch (e) { return json(401, { error: "Inicia sesión de nuevo." }); }
  const email = String(claims.preferred_username || claims.email || claims.upn || "").toLowerCase();
  if (!email) return json(401, { error: "Inicia sesión de nuevo." });

  const ar = await supa(`hub_access?email=ilike.${encodeURIComponent(email)}&select=email,teams,is_admin,nickname`);
  const access = (await ar.json())?.[0];
  if (!access) return json(403, { error: "No tienes acceso a HR." });

  const pr = await supa("hr_people?select=kind,id,data&order=id");
  if (!pr.ok) return json(500, { error: "No pude leer las personas." });
  const rows = await pr.json();
  const all = { contractors: rows.filter((r) => r.kind === "contractor").map((r) => r.data), supervisors: rows.filter((r) => r.kind === "supervisor").map((r) => r.data) };
  const scoped = scopeFor(access, all);
  if (!scoped) return json(403, { error: "No tienes acceso a HR." });

  if (body.action === "list") {
    const { canEdit, ...people } = scoped;
    if (canEdit) await ensureAccessRows(all).catch(() => {});
    return json(200, people);
  }

  if (body.action === "save") {
    if (!scoped.canEdit) return json(403, { error: "Solo William puede crear o editar personas." });
    const { kind, data } = body;
    if (!["contractor", "supervisor"].includes(kind) || !data || !Number.isInteger(data.id)) return json(400, { error: "Datos inválidos." });
    const r = await supa("hr_people", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ kind, id: data.id, data }) });
    if (!r.ok) return json(500, { error: "No pude guardar." });
    const next = { contractors: all.contractors.filter((c) => !(kind === "contractor" && c.id === data.id)), supervisors: all.supervisors.filter((x) => !(kind === "supervisor" && x.id === data.id)) };
    next[kind === "contractor" ? "contractors" : "supervisors"].push(data);
    await ensureAccessRows(next).catch(() => {});
    return json(200, { ok: true });
  }
  return json(400, { error: "Acción desconocida." });
};

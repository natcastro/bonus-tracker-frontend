import crypto from "node:crypto";

// Daily sync of the TikTok Shop Performance Score (SPS) into Supabase.
//   POST/GET  (header x-cron-secret)                -> fetch today's score and store it
//   POST/GET  ?authCode=XXXX (header x-cron-secret) -> one-time: exchange the seller auth code for tokens
const API = "https://open-api.tiktokglobalshop.com";
const AUTH = "https://auth.tiktok-shops.com";

const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj) });

function supa(path, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

// TikTok Shop request signature: HMAC-SHA256(secret, secret + path + sorted(key+value) + body + secret)
function sign(path, params, secret, body = "") {
  const str = Object.keys(params).filter((k) => k !== "sign" && k !== "access_token").sort().map((k) => k + params[k]).join("");
  return crypto.createHmac("sha256", secret).update(secret + path + str + body + secret).digest("hex");
}

async function apiGet(path, query, accessToken) {
  const { TIKTOK_APP_KEY: appKey, TIKTOK_APP_SECRET: secret } = process.env;
  const params = { app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)), ...query };
  params.sign = sign(path, params, secret);
  const resp = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { "content-type": "application/json", "x-tts-access-token": accessToken },
  });
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`TikTok ${path}: ${data.code} ${data.message}`);
  return data.data;
}

async function tokenCall(kind, extra) {
  const { TIKTOK_APP_KEY: appKey, TIKTOK_APP_SECRET: secret } = process.env;
  const q = new URLSearchParams({ app_key: appKey, app_secret: secret, ...extra });
  const resp = await fetch(`${AUTH}/api/v2/token/${kind}?${q}`);
  const data = await resp.json();
  if (data.code !== 0) throw new Error(`TikTok token/${kind}: ${data.code} ${data.message}`);
  return data.data;
}

const toIso = (unix) => (unix ? new Date(Number(unix) * 1000).toISOString() : null);

async function saveAuth(tok, shop) {
  const row = {
    id: 1, access_token: tok.access_token, refresh_token: tok.refresh_token,
    access_expires_at: toIso(tok.access_token_expire_in), refresh_expires_at: toIso(tok.refresh_token_expire_in),
    updated_at: new Date().toISOString(),
    ...(shop ? { shop_cipher: shop.cipher, shop_name: shop.name } : {}),
  };
  const r = await supa("tiktok_shop_auth", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`Saving tokens failed: ${r.status} ${await r.text()}`);
}

async function getAuth() {
  const r = await supa("tiktok_shop_auth?id=eq.1&select=*");
  return (await r.json())?.[0] ?? null;
}

// Pacific date of "now" — the day the seller sees in Seller Center for the US shop.
const usDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

function pickScore(d) {
  for (const k of ["score", "shop_score", "overall_score", "sps_score", "total_score", "shop_performance_score"]) {
    if (d?.[k] != null && !isNaN(Number(d[k]))) return Number(d[k]);
  }
  return null;
}

export const handler = async (event) => {
  const need = ["CRON_SECRET", "TIKTOK_APP_KEY", "TIKTOK_APP_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_URL"].filter((k) => !process.env[k]);
  if (need.length) return json(500, { error: `Missing environment variables: ${need.join(", ")}` });
  if (event.headers?.["x-cron-secret"] !== process.env.CRON_SECRET) return json(401, { error: "Unauthorized" });

  try {
    const authCode = event.queryStringParameters?.authCode;
    if (authCode) {
      const tok = await tokenCall("get", { auth_code: authCode, grant_type: "authorized_code" });
      const shops = (await apiGet("/authorization/202309/shops", {}, tok.access_token)).shops ?? [];
      const shop = shops.find((s) => s.region === "US") ?? shops[0];
      if (!shop) throw new Error("No authorized shops returned for this token.");
      await saveAuth(tok, shop);
      return json(200, { ok: true, connected: shop.name, region: shop.region, scopes: tok.granted_scopes });
    }

    let auth = await getAuth();
    if (!auth) return json(400, { error: "Not connected yet. Run once with ?authCode=..." });

    // Refresh the access token when it expires within a day.
    if (new Date(auth.access_expires_at).getTime() - Date.now() < 24 * 3600 * 1000) {
      const tok = await tokenCall("refresh", { refresh_token: auth.refresh_token, grant_type: "refresh_token" });
      await saveAuth(tok, null);
      auth = { ...auth, access_token: tok.access_token };
    }

    const data = await apiGet("/analytics/202606/shop_performances/overview", { shop_cipher: auth.shop_cipher, locale: "en-US" }, auth.access_token);
    const score = pickScore(data);
    const tier = data?.tier ?? data?.tier_name ?? null;
    const day = usDay();
    const r = await supa("tiktok_sps_daily", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ day, score, tier: tier == null ? null : String(typeof tier === "object" ? JSON.stringify(tier) : tier), raw: data, fetched_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`Saving score failed: ${r.status} ${await r.text()}`);
    // If the score field has a different name, the keys below tell us what to map.
    return json(200, { ok: true, day, score, tier, responseKeys: Object.keys(data || {}) });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

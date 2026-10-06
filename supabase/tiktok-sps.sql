-- TikTok Shop Performance Score (SPS): daily history + private OAuth tokens.

-- Daily snapshot of the shop score (readable by the app, written only by the server).
create table if not exists tiktok_sps_daily (
  day date primary key,
  score numeric,
  tier text,
  raw jsonb,
  fetched_at timestamptz not null default now()
);
alter table tiktok_sps_daily enable row level security;
create policy "read sps daily" on tiktok_sps_daily for select using (true);

-- Seller OAuth tokens: RLS on with NO policies, so the public anon key can never read them.
-- Only the Netlify function (SUPABASE_SERVICE_ROLE_KEY) can.
create table if not exists tiktok_shop_auth (
  id int primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  shop_cipher text,
  shop_name text,
  updated_at timestamptz not null default now()
);
alter table tiktok_shop_auth enable row level security;

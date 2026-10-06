-- Operations bonus approval: who may approve, who receives the email, and an audit log.
create table if not exists ops_approval_settings (
  id int primary key default 1 check (id = 1),
  approver_email text not null default '',
  hr_email text not null default '',
  copy_email text not null default ''
);
insert into ops_approval_settings (id) values (1) on conflict do nothing;

create table if not exists ops_approvals (
  id bigint generated always as identity primary key,
  year int not null,
  cycle_id text not null,
  approved_by text not null,
  sent_to text not null,
  total_amount numeric,
  approved_at timestamptz not null default now()
);

alter table ops_approval_settings enable row level security;
alter table ops_approvals enable row level security;
create policy "anon all" on ops_approval_settings for all using (true) with check (true);
create policy "anon all" on ops_approvals for all using (true) with check (true);

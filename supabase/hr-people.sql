-- HR people: pay rates, bank and tax data. RLS is ON with NO policies, so the public (anon) key can't read or write
-- this table at all — only the hr-people Netlify function (service role) can, after checking the Microsoft login.
create table if not exists hr_people (
  kind text not null check (kind in ('contractor', 'supervisor')),
  id   int  not null,
  data jsonb not null,
  primary key (kind, id)
);
alter table hr_people enable row level security;
revoke all on hr_people from anon, authenticated;

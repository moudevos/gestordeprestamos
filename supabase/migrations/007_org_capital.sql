alter table public.organizations
  add column if not exists working_capital numeric(12,2) not null default 0 check (working_capital >= 0),
  add column if not exists available_cash numeric(12,2) not null default 0 check (available_cash >= 0);

update public.organizations
set working_capital = 10000,
    available_cash = 10000
where id = '11111111-1111-1111-1111-111111111111'
  and working_capital = 0
  and available_cash = 0;

insert into public.organizations (id, name)
values ('11111111-1111-1111-1111-111111111111', 'Organizacion Demo')
on conflict do nothing;

insert into public.loan_policies (
  organization_id, scope, policy_name, interest_mode, interest_flat_pct, daily_overdue_pct,
  overdue_base, overdue_start_rule, overdue_cap_type, overdue_cap_value, payment_waterfall,
  allow_partial_payments, allow_refinance_after_interest_paid
)
select
  '11111111-1111-1111-1111-111111111111',
  'organization_default',
  'Politica base',
  'flat_pct',
  10,
  2,
  'saldo_vencido_total',
  'next_day',
  'amount',
  500,
  'penalty_interest_capital',
  true,
  true
where not exists (
  select 1 from public.loan_policies
  where organization_id = '11111111-1111-1111-1111-111111111111'
    and scope = 'organization_default'
);

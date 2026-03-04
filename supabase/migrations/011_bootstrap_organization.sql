create or replace function public.bootstrap_organization(params json)
returns table (
  organization_id uuid,
  profile_user_id uuid,
  role public.app_role,
  full_name text,
  phone text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(nullif(params->>'user_id', '')::uuid, auth.uid());
  v_org_id uuid;
  v_full_name text := nullif(trim(coalesce(params->>'full_name', '')), '');
  v_phone text := nullif(trim(coalesce(params->>'phone', '')), '');
begin
  if v_user_id is null then
    raise exception 'Authenticated user is required';
  end if;

  if auth.uid() is not null and v_user_id <> auth.uid() then
    raise exception 'Cannot bootstrap organization for another user';
  end if;

  if exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception 'User already belongs to an organization';
  end if;

  insert into public.organizations (
    name,
    currency_code,
    timezone,
    accent_color
  ) values (
    trim(params->>'company_name'),
    coalesce(nullif(params->>'currency_code', ''), 'PEN'),
    coalesce(nullif(params->>'timezone', ''), 'America/Lima'),
    coalesce(nullif(params->>'accent_color', ''), '#2f6fed')
  )
  returning id into v_org_id;

  insert into public.profiles (
    user_id,
    organization_id,
    role,
    full_name,
    phone
  ) values (
    v_user_id,
    v_org_id,
    'admin',
    coalesce(v_full_name, nullif(trim(coalesce(params->>'email', '')), '')),
    v_phone
  );

  insert into public.loan_policies (
    organization_id,
    scope,
    policy_name,
    interest_mode,
    interest_flat_pct,
    interest_flat_amount,
    commission_amount,
    daily_overdue_pct,
    overdue_base,
    overdue_start_rule,
    overdue_cap_type,
    overdue_cap_value,
    payment_waterfall,
    allow_partial_payments,
    allow_refinance_after_interest_paid
  ) values (
    v_org_id,
    'organization_default',
    'Politica general',
    'flat_pct',
    20,
    0,
    0,
    2,
    'saldo_vencido_total',
    'next_day',
    'amount',
    0,
    'penalty_interest_capital',
    true,
    true
  );

  perform public.write_audit(
    v_org_id,
    v_user_id,
    'organization',
    v_org_id,
    'create',
    null,
    jsonb_build_object('name', trim(params->>'company_name')),
    'bootstrap_organization'
  );

  return query
  select
    p.organization_id,
    p.user_id,
    p.role,
    p.full_name,
    p.phone
  from public.profiles p
  where p.user_id = v_user_id;
end;
$$;

grant execute on function public.bootstrap_organization(json) to authenticated, service_role;

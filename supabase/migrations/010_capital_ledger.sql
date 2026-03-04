create table if not exists public.capital_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  loan_id uuid references public.loans(id) on delete restrict,
  created_by uuid references auth.users(id) on delete restrict,
  movement_type text not null check (
    movement_type in (
      'initial_funding',
      'manual_funding',
      'loan_disbursement',
      'principal_collection',
      'interest_collection',
      'profit_withdrawal',
      'manual_adjustment'
    )
  ),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(12,2) not null check (amount >= 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists capital_movements_org_idx on public.capital_movements(organization_id, created_at desc);

alter table public.capital_movements enable row level security;

create policy capital_movements_select on public.capital_movements
for select
using (organization_id = public.current_profile_org());

create policy capital_movements_write on public.capital_movements
for all
using (organization_id = public.current_profile_org())
with check (organization_id = public.current_profile_org());

create or replace function public.get_capital_summary(p_organization_id uuid)
returns table (
  total_in numeric,
  total_out numeric,
  available_cash numeric,
  total_disbursed numeric,
  total_profit_withdrawn numeric,
  net_profit_collected numeric
)
language sql
security definer
set search_path = public
as $$
  with movement_totals as (
    select
      coalesce(sum(case when direction = 'in' then amount else 0 end), 0) as total_in,
      coalesce(sum(case when direction = 'out' then amount else 0 end), 0) as total_out,
      coalesce(sum(case when movement_type = 'loan_disbursement' then amount else 0 end), 0) as total_disbursed,
      coalesce(sum(case when movement_type = 'profit_withdrawal' then amount else 0 end), 0) as total_profit_withdrawn,
      coalesce(sum(case when movement_type = 'interest_collection' then amount else 0 end), 0) as interest_collected
    from public.capital_movements
    where organization_id = p_organization_id
  )
  select
    total_in,
    total_out,
    total_in - total_out as available_cash,
    total_disbursed,
    total_profit_withdrawn,
    interest_collected - total_profit_withdrawn as net_profit_collected
  from movement_totals;
$$;

create or replace function public.record_capital_movement(params json)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_org_id uuid := (params->>'organization_id')::uuid;
  v_actor uuid := coalesce((params->>'actor_user_id')::uuid, auth.uid());
begin
  insert into public.capital_movements (
    organization_id,
    loan_id,
    created_by,
    movement_type,
    direction,
    amount,
    note
  ) values (
    v_org_id,
    nullif(params->>'loan_id', '')::uuid,
    v_actor,
    params->>'movement_type',
    params->>'direction',
    (params->>'amount')::numeric,
    params->>'note'
  )
  returning id into v_id;

  perform public.write_audit(
    v_org_id,
    v_actor,
    'capital_movement',
    v_id,
    'create',
    null,
    jsonb_build_object(
      'movement_type', params->>'movement_type',
      'direction', params->>'direction',
      'amount', (params->>'amount')::numeric
    ),
    'record_capital_movement'
  );

  return v_id;
end;
$$;

create or replace function public.create_loan_with_schedule(params json)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := (params->>'organization_id')::uuid;
  v_actor uuid := coalesce((params->>'actor_user_id')::uuid, auth.uid());
  v_client_id uuid := (params->>'client_id')::uuid;
  v_policy_id uuid := nullif(params->>'policy_id', '')::uuid;
  v_principal numeric(12,2) := (params->>'principal_amount')::numeric;
  v_flat_interest numeric(12,2) := (params->>'flat_interest_amount')::numeric;
  v_commission numeric(12,2) := coalesce((params->>'commission_amount')::numeric, 0);
  v_disbursed date := (params->>'disbursed_at')::date;
  v_start date := (params->>'start_date')::date;
  v_frequency text := params->>'frequency';
  v_installments integer := (params->>'installments_count')::integer;
  v_total numeric(12,2);
  v_per_installment numeric(12,2);
  v_end date;
  v_loan_id uuid;
  v_available_cash numeric(12,2);
  i integer;
begin
  select available_cash into v_available_cash
  from public.get_capital_summary(v_org_id);

  if coalesce(v_available_cash, 0) < v_principal then
    raise exception 'Insufficient available cash to disburse this loan';
  end if;

  v_total := v_principal + v_flat_interest + v_commission;
  v_per_installment := round(v_total / v_installments, 2);
  v_end := case
    when v_frequency = 'daily' then v_start + ((v_installments - 1) || ' days')::interval
    when v_frequency = 'weekly' then v_start + (((v_installments - 1) * 7) || ' days')::interval
    when v_frequency = 'biweekly' then v_start + (((v_installments - 1) * 14) || ' days')::interval
    else v_start + ((v_installments - 1) || ' months')::interval
  end;

  insert into public.loans (
    organization_id, client_id, policy_id, disbursed_at, start_date, end_date, frequency,
    installments_count, principal_amount, flat_interest_amount, commission_amount, total_amount, status, notes
  ) values (
    v_org_id, v_client_id, v_policy_id, v_disbursed, v_start, v_end, v_frequency,
    v_installments, v_principal, v_flat_interest, v_commission, v_total, 'active', params->>'notes'
  ) returning id into v_loan_id;

  for i in 1..v_installments loop
    insert into public.installments (
      organization_id, loan_id, installment_number, due_date, amount_due, principal_due,
      interest_due, fee_due, amount_paid, remaining_amount, status
    ) values (
      v_org_id,
      v_loan_id,
      i,
      case
        when v_frequency = 'daily' then v_start + ((i - 1) || ' days')::interval
        when v_frequency = 'weekly' then v_start + (((i - 1) * 7) || ' days')::interval
        when v_frequency = 'biweekly' then v_start + (((i - 1) * 14) || ' days')::interval
        else v_start + ((i - 1) || ' months')::interval
      end,
      case when i = v_installments then v_total - (v_per_installment * (v_installments - 1)) else v_per_installment end,
      round(v_principal / v_installments, 2),
      round(v_flat_interest / v_installments, 2),
      round(v_commission / v_installments, 2),
      0,
      case when i = v_installments then v_total - (v_per_installment * (v_installments - 1)) else v_per_installment end,
      'pending'
    );
  end loop;

  insert into public.loan_balances (loan_id, organization_id, principal_outstanding, interest_outstanding, penalty_outstanding, total_outstanding)
  values (v_loan_id, v_org_id, v_principal, v_flat_interest + v_commission, 0, v_total);

  insert into public.capital_movements (
    organization_id, loan_id, created_by, movement_type, direction, amount, note
  ) values (
    v_org_id, v_loan_id, v_actor, 'loan_disbursement', 'out', v_principal, 'Desembolso de prestamo'
  );

  perform public.write_audit(v_org_id, v_actor, 'loan', v_loan_id, 'create', null, jsonb_build_object('total_amount', v_total), 'create_loan_with_schedule');
  return v_loan_id;
end;
$$;

create or replace function public.post_payment(params json)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := (params->>'organization_id')::uuid;
  v_actor uuid := coalesce((params->>'actor_user_id')::uuid, auth.uid());
  v_loan_id uuid := (params->>'loan_id')::uuid;
  v_amount numeric(12,2) := (params->>'amount')::numeric;
  v_policy public.loan_policies%rowtype;
  v_balance public.loan_balances%rowtype;
  v_payment_id uuid;
  v_remaining numeric(12,2);
  v_penalty numeric(12,2) := 0;
  v_interest numeric(12,2) := 0;
  v_principal numeric(12,2) := 0;
begin
  select * into v_balance from public.loan_balances where loan_id = v_loan_id for update;

  if not found then
    raise exception 'Loan balance not found for loan %', v_loan_id;
  end if;

  select lp.* into v_policy
  from public.loan_policies lp
  join public.loans l on l.id = v_loan_id
  where lp.organization_id = v_org_id and (lp.id = l.policy_id or (lp.scope = 'organization_default' and lp.loan_id is null))
  order by case when lp.scope = 'loan_override' then 0 else 1 end
  limit 1;

  if not found then
    raise exception 'Loan policy not found for loan %', v_loan_id;
  end if;

  insert into public.payments(organization_id, loan_id, paid_at, amount, method, reference, notes, created_by)
  values (
    v_org_id, v_loan_id, (params->>'paid_at')::date, v_amount, params->>'method', params->>'reference', params->>'notes', v_actor
  ) returning id into v_payment_id;

  v_remaining := v_amount;
  v_penalty := least(v_remaining, v_balance.penalty_outstanding);
  v_remaining := v_remaining - v_penalty;

  if v_policy.payment_waterfall = 'penalty_interest_capital' then
    v_interest := least(v_remaining, v_balance.interest_outstanding);
    v_remaining := v_remaining - v_interest;
    v_principal := least(v_remaining, v_balance.principal_outstanding);
  else
    v_principal := least(v_remaining, v_balance.principal_outstanding);
    v_remaining := v_remaining - v_principal;
    v_interest := least(v_remaining, v_balance.interest_outstanding);
  end if;

  if v_penalty > 0 then
    insert into public.payment_allocations(organization_id, payment_id, allocation_type, amount)
    values (v_org_id, v_payment_id, 'penalty', v_penalty);
  end if;
  if v_interest > 0 then
    insert into public.payment_allocations(organization_id, payment_id, allocation_type, amount)
    values (v_org_id, v_payment_id, 'interest', v_interest);
  end if;
  if v_principal > 0 then
    insert into public.payment_allocations(organization_id, payment_id, allocation_type, amount)
    values (v_org_id, v_payment_id, 'principal', v_principal);
  end if;

  update public.installments
  set amount_paid = least(amount_due, amount_paid + v_amount),
      remaining_amount = greatest(0, remaining_amount - v_amount),
      status = case
        when greatest(0, remaining_amount - v_amount) = 0 then 'paid'::public.installment_status
        else 'partial'::public.installment_status
      end
  where id = (
    select id from public.installments
    where loan_id = v_loan_id and status <> 'paid'::public.installment_status
    order by due_date, installment_number
    limit 1
  );

  update public.loan_balances
  set principal_outstanding = greatest(0, principal_outstanding - v_principal),
      interest_outstanding = greatest(0, interest_outstanding - v_interest),
      penalty_outstanding = greatest(0, penalty_outstanding - v_penalty),
      interest_collected = interest_collected + v_interest,
      total_outstanding = greatest(0, principal_outstanding + interest_outstanding + penalty_outstanding - (v_principal + v_interest + v_penalty)),
      updated_at = now()
  where loan_id = v_loan_id;

  if v_principal > 0 then
    insert into public.capital_movements (
      organization_id, loan_id, created_by, movement_type, direction, amount, note
    ) values (
      v_org_id, v_loan_id, v_actor, 'principal_collection', 'in', v_principal, 'Recuperacion de capital'
    );
  end if;

  if v_interest > 0 then
    insert into public.capital_movements (
      organization_id, loan_id, created_by, movement_type, direction, amount, note
    ) values (
      v_org_id, v_loan_id, v_actor, 'interest_collection', 'in', v_interest, 'Cobro de interes'
    );
  end if;

  update public.loans
  set status = case when (select total_outstanding from public.loan_balances where loan_id = v_loan_id) = 0 then 'paid' else status end
  where id = v_loan_id;

  perform public.write_audit(v_org_id, v_actor, 'payment', v_payment_id, 'create', null, jsonb_build_object('amount', v_amount), 'post_payment');
  return v_payment_id;
end;
$$;

grant execute on function public.get_capital_summary(uuid) to authenticated, service_role;
grant execute on function public.record_capital_movement(json) to authenticated, service_role;

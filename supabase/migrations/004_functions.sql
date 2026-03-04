create or replace function public.write_audit(
  p_org_id uuid,
  p_actor uuid,
  p_entity text,
  p_entity_id uuid,
  p_action text,
  p_before jsonb,
  p_after jsonb,
  p_reason text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log(organization_id, actor_user_id, entity, entity_id, action, before, after, reason)
  values (p_org_id, p_actor, p_entity, p_entity_id, p_action, p_before, p_after, p_reason);
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

  select lp.* into v_policy
  from public.loan_policies lp
  join public.loans l on l.id = v_loan_id
  where lp.organization_id = v_org_id and (lp.id = l.policy_id or (lp.scope = 'organization_default' and lp.loan_id is null))
  order by case when lp.scope = 'loan_override' then 0 else 1 end
  limit 1;

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
    where loan_id = v_loan_id and status <> 'paid'
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

  update public.loans
  set status = case when (select total_outstanding from public.loan_balances where loan_id = v_loan_id) = 0 then 'paid' else status end
  where id = v_loan_id;

  perform public.write_audit(v_org_id, v_actor, 'payment', v_payment_id, 'create', null, jsonb_build_object('amount', v_amount), 'post_payment');
  return v_payment_id;
end;
$$;

create or replace function public.compute_overdue(p_organization_id uuid, p_as_of_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan record;
  v_policy public.loan_policies%rowtype;
  v_base numeric(12,2);
  v_days integer;
  v_penalty numeric(12,2);
  v_cap numeric(12,2);
  v_count integer := 0;
begin
  for v_loan in
    select l.*, lb.principal_outstanding, lb.interest_outstanding
    from public.loans l
    join public.loan_balances lb on lb.loan_id = l.id
    where l.organization_id = p_organization_id and l.status in ('active', 'overdue') and l.deleted_at is null
  loop
    select lp.* into v_policy
    from public.loan_policies lp
    where lp.organization_id = p_organization_id and (lp.id = v_loan.policy_id or (lp.scope = 'organization_default' and lp.loan_id is null))
    order by case when lp.scope = 'loan_override' then 0 else 1 end
    limit 1;

    select coalesce(sum(remaining_amount), 0), coalesce(max(p_as_of_date - due_date), 0)
    into v_base, v_days
    from public.installments
    where loan_id = v_loan.id
      and status <> 'paid'
      and due_date < case when v_policy.overdue_start_rule = 'same_day' then p_as_of_date + 1 else p_as_of_date end;

    if v_base > 0 and v_days > 0 then
      v_penalty := round((v_policy.daily_overdue_pct / 100.0) * v_base * v_days, 2);
      v_cap := case
        when v_policy.overdue_cap_type = 'amount' then v_policy.overdue_cap_value
        when v_policy.overdue_cap_type = 'percent_capital' then round(v_loan.principal_amount * (v_policy.overdue_cap_value / 100.0), 2)
        when v_policy.overdue_cap_type = 'percent_total' then round(v_loan.total_amount * (v_policy.overdue_cap_value / 100.0), 2)
        else round((v_policy.daily_overdue_pct / 100.0) * v_base * least(v_days, v_policy.overdue_cap_value), 2)
      end;
      if v_cap > 0 then
        v_penalty := least(v_penalty, v_cap);
      end if;

      update public.loan_balances
      set penalty_outstanding = v_penalty,
          total_outstanding = principal_outstanding + interest_outstanding + v_penalty,
          last_overdue_computed_at = p_as_of_date,
          updated_at = now()
      where loan_id = v_loan.id;

      insert into public.loan_overdue_snapshots(organization_id, loan_id, as_of_date, overdue_base_amount, overdue_days, penalty_amount)
      values (p_organization_id, v_loan.id, p_as_of_date, v_base, v_days, v_penalty);

      update public.loans set status = 'overdue' where id = v_loan.id and status = 'active';
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.refinance_loan(params json)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := (params->>'organization_id')::uuid;
  v_actor uuid := coalesce((params->>'actor_user_id')::uuid, auth.uid());
  v_loan_id uuid := (params->>'loan_id')::uuid;
  v_balance public.loan_balances%rowtype;
  v_old public.loans%rowtype;
  v_allow boolean;
  v_new_loan uuid;
  v_new_principal numeric(12,2);
begin
  select * into v_balance from public.loan_balances where loan_id = v_loan_id;
  select * into v_old from public.loans where id = v_loan_id;

  select allow_refinance_after_interest_paid into v_allow
  from public.loan_policies
  where organization_id = v_org_id and (id = v_old.policy_id or (scope = 'organization_default' and loan_id is null))
  order by case when scope = 'loan_override' then 0 else 1 end
  limit 1;

  if v_allow and v_balance.interest_outstanding > 0 then
    raise exception 'Interest must be paid before refinancing';
  end if;

  v_new_principal := coalesce(nullif(params->>'new_principal_amount', '')::numeric, v_balance.principal_outstanding);

  v_new_loan := public.create_loan_with_schedule(
    json_build_object(
      'organization_id', v_org_id,
      'actor_user_id', v_actor,
      'client_id', v_old.client_id,
      'policy_id', v_old.policy_id,
      'principal_amount', v_new_principal,
      'flat_interest_amount', coalesce((params->>'flat_interest_amount')::numeric, 0),
      'commission_amount', coalesce((params->>'commission_amount')::numeric, 0),
      'disbursed_at', params->>'disbursed_at',
      'start_date', params->>'start_date',
      'frequency', params->>'frequency',
      'installments_count', (params->>'installments_count')::integer,
      'notes', coalesce(params->>'notes', 'Refinanciacion')
    )
  );

  update public.loans set status = 'refinanced' where id = v_loan_id;
  update public.loans set loan_parent_id = v_loan_id where id = v_new_loan;

  perform public.write_audit(v_org_id, v_actor, 'loan', v_new_loan, 'refinance', jsonb_build_object('parent_loan_id', v_loan_id), jsonb_build_object('new_principal_amount', v_new_principal), 'refinance_loan');
  return v_new_loan;
end;
$$;

create or replace function public.queue_reminders(p_as_of_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_policy public.loan_policies%rowtype;
  v_count integer := 0;
  v_days integer;
  v_type public.reminder_type;
begin
  for v_row in
    select l.organization_id, l.id as loan_id, l.client_id, c.email, i.due_date
    from public.loans l
    join public.clients c on c.id = l.client_id
    join public.installments i on i.loan_id = l.id
    where l.status in ('active', 'overdue') and i.status <> 'paid' and c.deleted_at is null
  loop
    select * into v_policy
    from public.loan_policies
    where organization_id = v_row.organization_id and (id = (select policy_id from public.loans where id = v_row.loan_id) or (scope = 'organization_default' and loan_id is null))
    order by case when scope = 'loan_override' then 0 else 1 end
    limit 1;

    v_type := null;
    if v_row.due_date = p_as_of_date + v_policy.remind_days_before then
      v_type := 'upcoming';
    elsif v_row.due_date = p_as_of_date then
      v_type := 'due_today';
    elsif v_row.due_date < p_as_of_date then
      v_days := p_as_of_date - v_row.due_date;
      if v_days = any(v_policy.remind_overdue_days) then
        v_type := case when v_days = 1 then 'overdue_day_1' when v_days = 3 then 'overdue_day_3' else 'overdue_day_7' end;
      end if;
    end if;

    if v_type is not null then
      insert into public.reminders(organization_id, loan_id, client_id, reminder_type, scheduled_for, payload)
      values (v_row.organization_id, v_row.loan_id, v_row.client_id, v_type, now(), jsonb_build_object('email', v_row.email));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.create_loan_with_schedule(json) to authenticated, service_role;
grant execute on function public.post_payment(json) to authenticated, service_role;
grant execute on function public.compute_overdue(uuid, date) to authenticated, service_role;
grant execute on function public.refinance_loan(json) to authenticated, service_role;
grant execute on function public.queue_reminders(date) to authenticated, service_role;

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
  i integer;
begin
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

  perform public.write_audit(v_org_id, v_actor, 'loan', v_loan_id, 'create', null, jsonb_build_object('total_amount', v_total), 'create_loan_with_schedule');
  return v_loan_id;
end;
$$;

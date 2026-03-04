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

  update public.loans
  set status = case when (select total_outstanding from public.loan_balances where loan_id = v_loan_id) = 0 then 'paid' else status end
  where id = v_loan_id;

  perform public.write_audit(v_org_id, v_actor, 'payment', v_payment_id, 'create', null, jsonb_build_object('amount', v_amount), 'post_payment');
  return v_payment_id;
end;
$$;

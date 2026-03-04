create or replace function public.delete_loan_with_reason(params json)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := (params->>'organization_id')::uuid;
  v_actor uuid := coalesce((params->>'actor_user_id')::uuid, auth.uid());
  v_loan_id uuid := (params->>'loan_id')::uuid;
  v_reason text := nullif(trim(coalesce(params->>'reason', '')), '');
  v_note text := nullif(trim(coalesce(params->>'note', '')), '');
  v_before public.loans%rowtype;
  v_total_in numeric(12,2) := 0;
  v_total_out numeric(12,2) := 0;
begin
  if v_loan_id is null then
    raise exception 'Loan id is required';
  end if;

  if v_reason is null then
    raise exception 'A delete reason is required';
  end if;

  select * into v_before
  from public.loans
  where id = v_loan_id
    and organization_id = v_org_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Loan not found or already deleted';
  end if;

  select
    coalesce(sum(case when direction = 'in' then amount else 0 end), 0),
    coalesce(sum(case when direction = 'out' then amount else 0 end), 0)
  into v_total_in, v_total_out
  from public.capital_movements
  where organization_id = v_org_id
    and loan_id = v_loan_id;

  if v_total_in > 0 then
    insert into public.capital_movements (
      organization_id, loan_id, created_by, movement_type, direction, amount, note
    ) values (
      v_org_id,
      v_loan_id,
      v_actor,
      'manual_adjustment',
      'out',
      v_total_in,
      'Reversion por eliminacion de prestamo'
    );
  end if;

  if v_total_out > 0 then
    insert into public.capital_movements (
      organization_id, loan_id, created_by, movement_type, direction, amount, note
    ) values (
      v_org_id,
      v_loan_id,
      v_actor,
      'manual_adjustment',
      'in',
      v_total_out,
      'Reversion por eliminacion de prestamo'
    );
  end if;

  update public.loans
  set
    status = 'cancelled',
    deleted_at = now(),
    notes = concat_ws(E'\n', nullif(notes, ''), '[Eliminado] Motivo: ' || v_reason, case when v_note is not null then '[Detalle] ' || v_note else null end)
  where id = v_loan_id;

  update public.installments
  set
    amount_paid = amount_due,
    remaining_amount = 0,
    status = 'paid'::public.installment_status
  where loan_id = v_loan_id
    and status <> 'paid'::public.installment_status;

  update public.loan_balances
  set
    principal_outstanding = 0,
    interest_outstanding = 0,
    penalty_outstanding = 0,
    total_outstanding = 0,
    updated_at = now()
  where loan_id = v_loan_id;

  update public.reminders
  set status = 'cancelled'
  where loan_id = v_loan_id
    and status = 'queued';

  perform public.write_audit(
    v_org_id,
    v_actor,
    'loan',
    v_loan_id,
    'delete',
    to_jsonb(v_before),
    jsonb_build_object('deleted_at', now(), 'reason', v_reason, 'note', v_note),
    v_reason
  );

  return v_loan_id;
end;
$$;

grant execute on function public.delete_loan_with_reason(json) to authenticated, service_role;

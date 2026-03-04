create or replace function public.current_profile_org()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_touch before update on public.clients for each row execute procedure public.touch_updated_at();
create trigger loan_policies_touch before update on public.loan_policies for each row execute procedure public.touch_updated_at();
create trigger interest_plans_touch before update on public.interest_plans for each row execute procedure public.touch_updated_at();
create trigger loans_touch before update on public.loans for each row execute procedure public.touch_updated_at();
create trigger installments_touch before update on public.installments for each row execute procedure public.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.loan_policies enable row level security;
alter table public.interest_plans enable row level security;
alter table public.loans enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.loan_balances enable row level security;
alter table public.loan_overdue_snapshots enable row level security;
alter table public.reminders enable row level security;
alter table public.reminder_logs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_log enable row level security;

create policy organizations_select on public.organizations for select using (id = public.current_profile_org());

create policy profiles_select on public.profiles for select using (organization_id = public.current_profile_org());
create policy profiles_insert_admin on public.profiles for insert with check (public.current_profile_role() = 'admin' and organization_id = public.current_profile_org());
create policy profiles_update_admin_or_self on public.profiles for update using (
  organization_id = public.current_profile_org() and (public.current_profile_role() = 'admin' or user_id = auth.uid())
) with check (
  organization_id = public.current_profile_org() and (public.current_profile_role() = 'admin' or user_id = auth.uid())
);

create policy tenant_select_clients on public.clients for select using (organization_id = public.current_profile_org());
create policy tenant_write_clients on public.clients for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_loan_policies on public.loan_policies for select using (organization_id = public.current_profile_org());
create policy tenant_write_loan_policies on public.loan_policies for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_interest_plans on public.interest_plans for select using (organization_id = public.current_profile_org());
create policy tenant_write_interest_plans on public.interest_plans for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_loans on public.loans for select using (organization_id = public.current_profile_org());
create policy tenant_write_loans on public.loans for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_installments on public.installments for select using (organization_id = public.current_profile_org());
create policy tenant_write_installments on public.installments for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_payments on public.payments for select using (organization_id = public.current_profile_org());
create policy tenant_write_payments on public.payments for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_payment_allocations on public.payment_allocations for select using (organization_id = public.current_profile_org());
create policy tenant_write_payment_allocations on public.payment_allocations for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_loan_balances on public.loan_balances for select using (organization_id = public.current_profile_org());
create policy tenant_write_loan_balances on public.loan_balances for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_loan_overdue_snapshots on public.loan_overdue_snapshots for select using (organization_id = public.current_profile_org());
create policy tenant_write_loan_overdue_snapshots on public.loan_overdue_snapshots for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_reminders on public.reminders for select using (organization_id = public.current_profile_org());
create policy tenant_write_reminders on public.reminders for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy tenant_select_reminder_logs on public.reminder_logs for select using (organization_id = public.current_profile_org());
create policy tenant_write_reminder_logs on public.reminder_logs for all using (organization_id = public.current_profile_org()) with check (organization_id = public.current_profile_org());
create policy push_select_own on public.push_subscriptions for select using (organization_id = public.current_profile_org());
create policy push_write_own on public.push_subscriptions for all using (
  organization_id = public.current_profile_org() and user_id = auth.uid()
) with check (
  organization_id = public.current_profile_org() and user_id = auth.uid()
);
create policy tenant_select_audit on public.audit_log for select using (organization_id = public.current_profile_org());

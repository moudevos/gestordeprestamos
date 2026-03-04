create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  paid_at date not null,
  amount numeric(12,2) not null check (amount >= 0),
  method text not null,
  reference text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete cascade,
  installment_id uuid references public.installments(id) on delete restrict,
  allocation_type text not null check (allocation_type in ('penalty', 'interest', 'principal')),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table public.loan_balances (
  loan_id uuid primary key references public.loans(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  principal_outstanding numeric(12,2) not null default 0 check (principal_outstanding >= 0),
  interest_outstanding numeric(12,2) not null default 0 check (interest_outstanding >= 0),
  penalty_outstanding numeric(12,2) not null default 0 check (penalty_outstanding >= 0),
  total_outstanding numeric(12,2) not null default 0 check (total_outstanding >= 0),
  interest_collected numeric(12,2) not null default 0 check (interest_collected >= 0),
  last_overdue_computed_at date,
  updated_at timestamptz not null default now()
);

create table public.loan_overdue_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  as_of_date date not null,
  overdue_base_amount numeric(12,2) not null default 0 check (overdue_base_amount >= 0),
  overdue_days integer not null default 0 check (overdue_days >= 0),
  penalty_amount numeric(12,2) not null default 0 check (penalty_amount >= 0),
  created_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  reminder_type public.reminder_type not null,
  scheduled_for timestamptz not null,
  status public.reminder_status not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status public.reminder_status not null,
  response_message text,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.loan_policies
  add constraint loan_policies_loan_fk
  foreign key (loan_id) references public.loans(id) on delete restrict;

create unique index clients_org_doc_unique on public.clients(organization_id, doc_number) where deleted_at is null;
create index clients_org_idx on public.clients(organization_id);
create index clients_doc_idx on public.clients(doc_number);
create index loan_policies_org_idx on public.loan_policies(organization_id);
create index interest_plans_org_idx on public.interest_plans(organization_id);
create index loans_org_idx on public.loans(organization_id);
create index loans_client_idx on public.loans(client_id);
create index installments_org_idx on public.installments(organization_id);
create index installments_loan_due_idx on public.installments(loan_id, due_date);
create index payments_org_idx on public.payments(organization_id);
create index payments_loan_paid_idx on public.payments(loan_id, paid_at);
create index payment_allocations_org_idx on public.payment_allocations(organization_id);
create index loan_balances_org_idx on public.loan_balances(organization_id);
create index loan_overdue_snapshots_org_idx on public.loan_overdue_snapshots(organization_id);
create index reminders_org_idx on public.reminders(organization_id);
create index reminders_status_idx on public.reminders(status, scheduled_for);
create index reminder_logs_org_idx on public.reminder_logs(organization_id);
create index push_subscriptions_org_idx on public.push_subscriptions(organization_id);
create index audit_log_org_idx on public.audit_log(organization_id, created_at desc);

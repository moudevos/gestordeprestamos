create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'collector');
create type public.loan_status as enum ('draft', 'active', 'overdue', 'paid', 'refinanced', 'closed', 'cancelled');
create type public.installment_status as enum ('pending', 'partial', 'paid', 'overdue');
create type public.policy_scope as enum ('organization_default', 'loan_override');
create type public.reminder_status as enum ('queued', 'sent', 'failed', 'cancelled');
create type public.reminder_type as enum ('upcoming', 'due_today', 'overdue_day_1', 'overdue_day_3', 'overdue_day_7');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency_code text not null default 'PEN',
  timezone text not null default 'America/Lima',
  accent_color text not null default '#2f6fed',
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  role public.app_role not null default 'collector',
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  doc_type text not null,
  doc_number text not null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text,
  address text,
  occupation text,
  estimated_income numeric(12,2) not null default 0 check (estimated_income >= 0),
  internal_notes text,
  status text not null default 'active' check (status in ('active', 'blocked')),
  score_value integer not null default 50 check (score_value >= 0 and score_value <= 100),
  score_label text not null default 'medio' check (score_label in ('bajo', 'medio', 'alto')),
  score_notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loan_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  loan_id uuid,
  scope public.policy_scope not null,
  policy_name text not null,
  interest_mode text not null default 'flat_pct' check (interest_mode in ('flat_pct', 'flat_amount')),
  interest_flat_pct numeric(8,4) not null default 0 check (interest_flat_pct >= 0),
  interest_flat_amount numeric(12,2) not null default 0 check (interest_flat_amount >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  daily_overdue_pct numeric(8,4) not null default 2 check (daily_overdue_pct >= 0),
  overdue_base text not null default 'saldo_vencido_total' check (overdue_base = 'saldo_vencido_total'),
  overdue_start_rule text not null default 'next_day' check (overdue_start_rule in ('same_day', 'next_day')),
  overdue_cap_type text not null default 'amount' check (overdue_cap_type in ('amount', 'percent_capital', 'percent_total', 'days')),
  overdue_cap_value numeric(12,2) not null default 0 check (overdue_cap_value >= 0),
  payment_waterfall text not null default 'penalty_interest_capital' check (payment_waterfall in ('penalty_interest_capital', 'penalty_capital_interest')),
  allow_partial_payments boolean not null default true,
  allow_refinance_after_interest_paid boolean not null default true,
  remind_days_before integer not null default 1 check (remind_days_before >= 0),
  remind_overdue_days integer[] not null default '{1,3,7}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loan_policies_scope_check check (
    (scope = 'organization_default' and loan_id is null) or
    (scope = 'loan_override' and loan_id is not null)
  )
);

create table public.interest_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plan_name text not null,
  plazo_dias_min integer not null check (plazo_dias_min >= 0),
  plazo_dias_max integer not null check (plazo_dias_max >= plazo_dias_min),
  cuotas_min integer not null check (cuotas_min > 0),
  cuotas_max integer not null check (cuotas_max >= cuotas_min),
  interes_flat_pct numeric(8,4) not null default 0 check (interes_flat_pct >= 0),
  interes_flat_amount numeric(12,2) not null default 0 check (interes_flat_amount >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  loan_parent_id uuid references public.loans(id) on delete restrict,
  policy_id uuid references public.loan_policies(id) on delete restrict,
  disbursed_at date not null,
  start_date date not null,
  end_date date not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  installments_count integer not null check (installments_count > 0),
  principal_amount numeric(12,2) not null check (principal_amount >= 0),
  flat_interest_amount numeric(12,2) not null default 0 check (flat_interest_amount >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status public.loan_status not null default 'active',
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  loan_id uuid not null references public.loans(id) on delete restrict,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount_due numeric(12,2) not null check (amount_due >= 0),
  principal_due numeric(12,2) not null default 0 check (principal_due >= 0),
  interest_due numeric(12,2) not null default 0 check (interest_due >= 0),
  fee_due numeric(12,2) not null default 0 check (fee_due >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  remaining_amount numeric(12,2) not null check (remaining_amount >= 0),
  status public.installment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, installment_number)
);

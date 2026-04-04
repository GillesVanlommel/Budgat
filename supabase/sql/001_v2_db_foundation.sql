create extension if not exists pgcrypto;

do $$
begin
  create type public.household_member_role as enum ('owner', 'admin', 'member');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.account_type as enum ('checking', 'savings', 'cash', 'credit_card', 'investment', 'loan');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.category_flow_type as enum ('expense', 'income');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.household_transaction_kind as enum ('expense', 'income', 'transfer');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_currency text not null default 'EUR',
  created_by_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint households_base_currency_format
    check (char_length(base_currency) = 3 and base_currency = upper(base_currency))
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.household_member_role not null default 'member',
  display_name text,
  joined_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  owner_member_id uuid references public.household_members (id) on delete set null,
  name text not null,
  account_type public.account_type not null,
  opening_balance numeric(14, 2) not null default 0,
  include_in_budget boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.category_kinds (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  flow_type public.category_flow_type not null,
  budgetable boolean not null default false,
  system_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.household_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by_user_id uuid not null references auth.users (id),
  name text not null,
  category_kind_id uuid not null references public.category_kinds (id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_months (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  month_date date not null,
  created_by_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, month_date),
  constraint budget_months_first_day_only
    check (date_trunc('month', month_date::timestamp)::date = month_date)
);

create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  budget_month_id uuid not null references public.budget_months (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  category_id uuid not null references public.household_categories (id) on delete cascade,
  planned_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_month_id, category_id),
  constraint budget_lines_planned_amount_nonnegative check (planned_amount >= 0)
);

create table if not exists public.household_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  entered_by_user_id uuid not null references auth.users (id),
  transaction_date date not null,
  kind public.household_transaction_kind not null,
  description text not null,
  notes text,
  amount numeric(14, 2) not null,
  account_id uuid not null references public.accounts (id) on delete restrict,
  to_account_id uuid references public.accounts (id) on delete restrict,
  category_id uuid references public.household_categories (id) on delete restrict,
  is_cleared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_transactions_amount_positive check (amount > 0),
  constraint household_transactions_kind_shape check (
    (
      kind = 'transfer'
      and to_account_id is not null
      and category_id is null
      and to_account_id <> account_id
    )
    or
    (
      kind in ('expense', 'income')
      and to_account_id is null
      and category_id is not null
    )
  )
);

create table if not exists public.account_reconciliations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  reconciliation_date date not null,
  actual_balance numeric(14, 2) not null,
  notes text,
  created_by_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (account_id, reconciliation_date)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at_accounts on public.accounts;
create trigger set_updated_at_accounts
before update on public.accounts
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_household_categories on public.household_categories;
create trigger set_updated_at_household_categories
before update on public.household_categories
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_budget_months on public.budget_months;
create trigger set_updated_at_budget_months
before update on public.budget_months
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_budget_lines on public.budget_lines;
create trigger set_updated_at_budget_lines
before update on public.budget_lines
for each row
execute function public.set_updated_at();

drop trigger if exists set_updated_at_household_transactions on public.household_transactions;
create trigger set_updated_at_household_transactions
before update on public.household_transactions
for each row
execute function public.set_updated_at();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin')
  );
$$;

create or replace function public.validate_account_owner_member()
returns trigger
language plpgsql
as $$
declare
  member_household_id uuid;
begin
  if new.owner_member_id is null then
    return new;
  end if;

  select household_id
    into member_household_id
  from public.household_members
  where id = new.owner_member_id;

  if member_household_id is null then
    raise exception 'owner_member_id must reference an existing household member';
  end if;

  if member_household_id <> new.household_id then
    raise exception 'account owner must belong to the same household';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_account_owner_member on public.accounts;
create trigger validate_account_owner_member
before insert or update on public.accounts
for each row
execute function public.validate_account_owner_member();

create or replace function public.validate_budget_line_category()
returns trigger
language plpgsql
as $$
declare
  category_household_id uuid;
  category_flow public.category_flow_type;
  category_budgetable boolean;
begin
  select hc.household_id, ck.flow_type, ck.budgetable
    into category_household_id, category_flow, category_budgetable
  from public.household_categories hc
  join public.category_kinds ck on ck.id = hc.category_kind_id
  where hc.id = new.category_id;

  if category_household_id is null then
    raise exception 'budget line category must reference an existing household category';
  end if;

  if category_household_id <> new.household_id then
    raise exception 'budget line category must belong to the same household';
  end if;

  if category_flow <> 'expense' or category_budgetable is not true then
    raise exception 'budget lines may only use budgetable expense categories';
  end if;

  if not exists (
    select 1
    from public.budget_months bm
    where bm.id = new.budget_month_id
      and bm.household_id = new.household_id
  ) then
    raise exception 'budget month must belong to the same household as the budget line';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_budget_line_category on public.budget_lines;
create trigger validate_budget_line_category
before insert or update on public.budget_lines
for each row
execute function public.validate_budget_line_category();

create or replace function public.validate_household_transaction()
returns trigger
language plpgsql
as $$
declare
  source_household_id uuid;
  destination_household_id uuid;
  category_household_id uuid;
  category_flow public.category_flow_type;
begin
  select household_id
    into source_household_id
  from public.accounts
  where id = new.account_id;

  if source_household_id is null then
    raise exception 'account_id must reference an existing account';
  end if;

  if source_household_id <> new.household_id then
    raise exception 'source account must belong to the same household';
  end if;

  if new.to_account_id is not null then
    select household_id
      into destination_household_id
    from public.accounts
    where id = new.to_account_id;

    if destination_household_id is null then
      raise exception 'to_account_id must reference an existing account';
    end if;

    if destination_household_id <> new.household_id then
      raise exception 'destination account must belong to the same household';
    end if;
  end if;

  if new.category_id is not null then
    select hc.household_id, ck.flow_type
      into category_household_id, category_flow
    from public.household_categories hc
    join public.category_kinds ck on ck.id = hc.category_kind_id
    where hc.id = new.category_id;

    if category_household_id is null then
      raise exception 'category_id must reference an existing household category';
    end if;

    if category_household_id <> new.household_id then
      raise exception 'transaction category must belong to the same household';
    end if;

    if new.kind = 'expense' and category_flow <> 'expense' then
      raise exception 'expense transactions must use expense categories';
    end if;

    if new.kind = 'income' and category_flow <> 'income' then
      raise exception 'income transactions must use income categories';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_household_transaction on public.household_transactions;
create trigger validate_household_transaction
before insert or update on public.household_transactions
for each row
execute function public.validate_household_transaction();

create or replace function public.validate_account_reconciliation()
returns trigger
language plpgsql
as $$
declare
  account_household_id uuid;
begin
  select household_id
    into account_household_id
  from public.accounts
  where id = new.account_id;

  if account_household_id is null then
    raise exception 'account reconciliation must reference an existing account';
  end if;

  if account_household_id <> new.household_id then
    raise exception 'reconciliation account must belong to the same household';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_account_reconciliation on public.account_reconciliations;
create trigger validate_account_reconciliation
before insert or update on public.account_reconciliations
for each row
execute function public.validate_account_reconciliation();

create index if not exists household_members_user_id_idx
  on public.household_members (user_id);

create index if not exists household_members_household_id_idx
  on public.household_members (household_id);

create index if not exists accounts_household_id_idx
  on public.accounts (household_id);

create unique index if not exists accounts_household_name_active_idx
  on public.accounts (household_id, lower(name))
  where archived = false;

create index if not exists household_categories_household_id_idx
  on public.household_categories (household_id);

create unique index if not exists household_categories_household_name_active_idx
  on public.household_categories (household_id, lower(name))
  where archived = false;

create index if not exists budget_months_household_month_idx
  on public.budget_months (household_id, month_date);

create index if not exists budget_lines_household_id_idx
  on public.budget_lines (household_id);

create index if not exists household_transactions_household_date_idx
  on public.household_transactions (household_id, transaction_date desc);

create index if not exists household_transactions_account_id_idx
  on public.household_transactions (account_id);

create index if not exists household_transactions_to_account_id_idx
  on public.household_transactions (to_account_id);

create index if not exists household_transactions_category_id_idx
  on public.household_transactions (category_id);

create index if not exists account_reconciliations_account_date_idx
  on public.account_reconciliations (account_id, reconciliation_date desc);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.category_kinds enable row level security;
alter table public.household_categories enable row level security;
alter table public.budget_months enable row level security;
alter table public.budget_lines enable row level security;
alter table public.household_transactions enable row level security;
alter table public.account_reconciliations enable row level security;

drop policy if exists households_select_member on public.households;
create policy households_select_member
on public.households
for select
to authenticated
using (public.is_household_member(id));

drop policy if exists households_insert_creator on public.households;
create policy households_insert_creator
on public.households
for insert
to authenticated
with check (created_by_user_id = auth.uid());

drop policy if exists households_update_admin on public.households;
create policy households_update_admin
on public.households
for update
to authenticated
using (public.is_household_admin(id))
with check (public.is_household_admin(id));

drop policy if exists households_delete_admin on public.households;
create policy households_delete_admin
on public.households
for delete
to authenticated
using (public.is_household_admin(id));

drop policy if exists household_members_select_member on public.household_members;
create policy household_members_select_member
on public.household_members
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists household_members_insert_admin_or_creator on public.household_members;
create policy household_members_insert_admin_or_creator
on public.household_members
for insert
to authenticated
with check (
  public.is_household_admin(household_id)
  or (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1
      from public.households h
      where h.id = household_id
        and h.created_by_user_id = auth.uid()
    )
  )
);

drop policy if exists household_members_update_admin on public.household_members;
create policy household_members_update_admin
on public.household_members
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists household_members_delete_admin on public.household_members;
create policy household_members_delete_admin
on public.household_members
for delete
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists accounts_select_member on public.accounts;
create policy accounts_select_member
on public.accounts
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists accounts_insert_admin on public.accounts;
create policy accounts_insert_admin
on public.accounts
for insert
to authenticated
with check (public.is_household_admin(household_id));

drop policy if exists accounts_update_admin on public.accounts;
create policy accounts_update_admin
on public.accounts
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists accounts_delete_admin on public.accounts;
create policy accounts_delete_admin
on public.accounts
for delete
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists category_kinds_select_authenticated on public.category_kinds;
create policy category_kinds_select_authenticated
on public.category_kinds
for select
to authenticated
using (true);

drop policy if exists household_categories_select_member on public.household_categories;
create policy household_categories_select_member
on public.household_categories
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists household_categories_insert_admin on public.household_categories;
create policy household_categories_insert_admin
on public.household_categories
for insert
to authenticated
with check (
  public.is_household_admin(household_id)
  and created_by_user_id = auth.uid()
);

drop policy if exists household_categories_update_admin on public.household_categories;
create policy household_categories_update_admin
on public.household_categories
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists household_categories_delete_admin on public.household_categories;
create policy household_categories_delete_admin
on public.household_categories
for delete
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists budget_months_select_member on public.budget_months;
create policy budget_months_select_member
on public.budget_months
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists budget_months_insert_admin on public.budget_months;
create policy budget_months_insert_admin
on public.budget_months
for insert
to authenticated
with check (
  public.is_household_admin(household_id)
  and created_by_user_id = auth.uid()
);

drop policy if exists budget_months_update_admin on public.budget_months;
create policy budget_months_update_admin
on public.budget_months
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists budget_months_delete_admin on public.budget_months;
create policy budget_months_delete_admin
on public.budget_months
for delete
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists budget_lines_select_member on public.budget_lines;
create policy budget_lines_select_member
on public.budget_lines
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists budget_lines_insert_admin on public.budget_lines;
create policy budget_lines_insert_admin
on public.budget_lines
for insert
to authenticated
with check (public.is_household_admin(household_id));

drop policy if exists budget_lines_update_admin on public.budget_lines;
create policy budget_lines_update_admin
on public.budget_lines
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

drop policy if exists budget_lines_delete_admin on public.budget_lines;
create policy budget_lines_delete_admin
on public.budget_lines
for delete
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists household_transactions_select_member on public.household_transactions;
create policy household_transactions_select_member
on public.household_transactions
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists household_transactions_insert_member on public.household_transactions;
create policy household_transactions_insert_member
on public.household_transactions
for insert
to authenticated
with check (
  public.is_household_member(household_id)
  and entered_by_user_id = auth.uid()
);

drop policy if exists household_transactions_update_member on public.household_transactions;
create policy household_transactions_update_member
on public.household_transactions
for update
to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists household_transactions_delete_member on public.household_transactions;
create policy household_transactions_delete_member
on public.household_transactions
for delete
to authenticated
using (public.is_household_member(household_id));

drop policy if exists account_reconciliations_select_member on public.account_reconciliations;
create policy account_reconciliations_select_member
on public.account_reconciliations
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists account_reconciliations_insert_member on public.account_reconciliations;
create policy account_reconciliations_insert_member
on public.account_reconciliations
for insert
to authenticated
with check (
  public.is_household_member(household_id)
  and created_by_user_id = auth.uid()
);

drop policy if exists account_reconciliations_update_member on public.account_reconciliations;
create policy account_reconciliations_update_member
on public.account_reconciliations
for update
to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists account_reconciliations_delete_member on public.account_reconciliations;
create policy account_reconciliations_delete_member
on public.account_reconciliations
for delete
to authenticated
using (public.is_household_member(household_id));

insert into public.category_kinds (key, display_name, flow_type, budgetable, system_order)
values
  ('groceries', 'Groceries', 'expense', true, 10),
  ('dining_out', 'Dining Out', 'expense', true, 20),
  ('rent', 'Rent', 'expense', true, 30),
  ('mortgage', 'Mortgage', 'expense', true, 40),
  ('utilities', 'Utilities', 'expense', true, 50),
  ('internet', 'Internet', 'expense', true, 60),
  ('phone', 'Phone', 'expense', true, 70),
  ('insurance', 'Insurance', 'expense', true, 80),
  ('healthcare', 'Healthcare', 'expense', true, 90),
  ('transport', 'Transport', 'expense', true, 100),
  ('fuel', 'Fuel', 'expense', true, 110),
  ('public_transport', 'Public Transport', 'expense', true, 120),
  ('childcare', 'Childcare', 'expense', true, 130),
  ('pets', 'Pets', 'expense', true, 140),
  ('subscriptions', 'Subscriptions', 'expense', true, 150),
  ('entertainment', 'Entertainment', 'expense', true, 160),
  ('shopping', 'Shopping', 'expense', true, 170),
  ('gifts', 'Gifts', 'expense', true, 180),
  ('travel', 'Travel', 'expense', true, 190),
  ('taxes_fees', 'Taxes & Fees', 'expense', true, 200),
  ('household_misc', 'Household Misc', 'expense', true, 210),
  ('personal_misc', 'Personal Misc', 'expense', true, 220),
  ('salary', 'Salary', 'income', false, 300),
  ('freelance', 'Freelance', 'income', false, 310),
  ('bonus', 'Bonus', 'income', false, 320),
  ('reimbursement', 'Reimbursement', 'income', false, 330),
  ('gift_received', 'Gift Received', 'income', false, 340),
  ('interest', 'Interest', 'income', false, 350),
  ('dividend', 'Dividend', 'income', false, 360),
  ('other_income', 'Other Income', 'income', false, 370)
on conflict (key) do update
set
  display_name = excluded.display_name,
  flow_type = excluded.flow_type,
  budgetable = excluded.budgetable,
  system_order = excluded.system_order;

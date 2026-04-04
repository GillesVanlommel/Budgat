alter table public.household_categories
  add column if not exists account_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_categories_account_id_fkey'
  ) then
    alter table public.household_categories
      add constraint household_categories_account_id_fkey
      foreign key (account_id) references public.accounts (id) on delete cascade;
  end if;
end $$;

with ranked_tx_accounts as (
  select
    ht.category_id,
    ht.account_id,
    row_number() over (
      partition by ht.category_id
      order by count(*) desc, min(ht.created_at) asc
    ) as rn
  from public.household_transactions ht
  where ht.category_id is not null
  group by ht.category_id, ht.account_id
),
default_household_accounts as (
  select distinct on (a.household_id)
    a.household_id,
    a.id as account_id
  from public.accounts a
  where a.archived = false
  order by a.household_id, a.created_at asc, a.id asc
)
update public.household_categories hc
set account_id = coalesce(rta.account_id, dha.account_id)
from default_household_accounts dha
left join ranked_tx_accounts rta
  on rta.category_id = hc.id
 and rta.rn = 1
where hc.account_id is null
  and dha.household_id = hc.household_id;

do $$
declare
  v_missing_count integer;
begin
  select count(*)
    into v_missing_count
  from public.household_categories
  where account_id is null;

  if v_missing_count > 0 then
    raise exception 'Cannot finalize account-based categories: % categories still have no account. Create at least one account per household, then rerun this migration.', v_missing_count;
  end if;
end $$;

alter table public.household_categories
  alter column account_id set not null;

create index if not exists household_categories_account_id_idx
  on public.household_categories (account_id);

drop index if exists public.household_categories_household_name_active_idx;

create unique index if not exists household_categories_household_account_name_active_idx
  on public.household_categories (household_id, account_id, lower(name))
  where archived = false;

create or replace function public.validate_household_category_account()
returns trigger
language plpgsql
as $$
declare
  v_account_household_id uuid;
begin
  select household_id
    into v_account_household_id
  from public.accounts
  where id = new.account_id;

  if v_account_household_id is null then
    raise exception 'category account must reference an existing account';
  end if;

  if v_account_household_id <> new.household_id then
    raise exception 'category account must belong to the same household';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_household_category_account on public.household_categories;
create trigger validate_household_category_account
before insert or update on public.household_categories
for each row
execute function public.validate_household_category_account();

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

create or replace function public.validate_household_transaction()
returns trigger
language plpgsql
as $$
declare
  source_household_id uuid;
  destination_household_id uuid;
  category_household_id uuid;
  category_account_id uuid;
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
    select hc.household_id, hc.account_id, ck.flow_type
      into category_household_id, category_account_id, category_flow
    from public.household_categories hc
    join public.category_kinds ck on ck.id = hc.category_kind_id
    where hc.id = new.category_id;

    if category_household_id is null then
      raise exception 'category_id must reference an existing household category';
    end if;

    if category_household_id <> new.household_id then
      raise exception 'transaction category must belong to the same household';
    end if;

    if category_account_id <> new.account_id then
      raise exception 'transaction category must belong to the selected source account';
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

drop function if exists public.list_household_categories(uuid);

create or replace function public.list_household_categories(
  p_household_id uuid,
  p_account_id uuid
)
returns table (
  category_id uuid,
  household_id uuid,
  account_id uuid,
  account_name text,
  name text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_kind_id uuid,
  category_kind_key text,
  category_kind_name text,
  flow_type public.category_flow_type,
  budgetable boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    hc.id as category_id,
    hc.household_id,
    hc.account_id,
    a.name as account_name,
    hc.name,
    hc.archived,
    hc.created_at,
    hc.updated_at,
    ck.id as category_kind_id,
    ck.key as category_kind_key,
    ck.display_name as category_kind_name,
    ck.flow_type,
    ck.budgetable
  from public.household_categories hc
  join public.accounts a on a.id = hc.account_id
  join public.category_kinds ck on ck.id = hc.category_kind_id
  where hc.household_id = p_household_id
    and public.is_household_member(p_household_id)
    and (p_account_id is null or hc.account_id = p_account_id)
  order by hc.archived asc, lower(a.name) asc, lower(hc.name) asc, hc.created_at asc;
$$;

create or replace function public.create_household_category_by_kind(
  p_household_id uuid,
  p_account_id uuid,
  p_name text,
  p_category_kind_key text
)
returns public.household_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_category_name text;
  v_kind_key text;
  v_category_kind_id uuid;
  v_account_household_id uuid;
  v_category public.household_categories;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Only household admins can create categories';
  end if;

  v_category_name := nullif(btrim(p_name), '');
  if v_category_name is null then
    raise exception 'Category name is required';
  end if;

  v_kind_key := nullif(btrim(p_category_kind_key), '');
  if v_kind_key is null then
    raise exception 'Category kind key is required';
  end if;

  select ck.id
    into v_category_kind_id
  from public.category_kinds ck
  where ck.key = v_kind_key;

  if v_category_kind_id is null then
    raise exception 'Unknown category kind key: %', v_kind_key;
  end if;

  select a.household_id
    into v_account_household_id
  from public.accounts a
  where a.id = p_account_id;

  if v_account_household_id is null then
    raise exception 'Account is required for account-based categories';
  end if;

  if v_account_household_id <> p_household_id then
    raise exception 'Account must belong to the same household';
  end if;

  insert into public.household_categories (
    household_id,
    account_id,
    created_by_user_id,
    name,
    category_kind_id
  )
  values (
    p_household_id,
    p_account_id,
    v_user_id,
    v_category_name,
    v_category_kind_id
  )
  returning * into v_category;

  return v_category;
end;
$$;

drop function if exists public.create_household_category_simple(uuid, text, text);

create or replace function public.create_household_category_simple(
  p_household_id uuid,
  p_account_id uuid,
  p_name text,
  p_flow_type text
)
returns public.household_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow_type text;
  v_kind_key text;
begin
  v_flow_type := lower(coalesce(btrim(p_flow_type), ''));

  if v_flow_type = 'transfer' then
    raise exception 'Transfer categories are not needed. Transfers are tracked between accounts.';
  end if;

  if v_flow_type = 'expense' then
    v_kind_key := 'household_misc';
  elsif v_flow_type = 'income' then
    v_kind_key := 'other_income';
  else
    raise exception 'Category type must be expense or income';
  end if;

  return public.create_household_category_by_kind(
    p_household_id,
    p_account_id,
    p_name,
    v_kind_key
  );
end;
$$;

grant execute on function public.list_household_categories(uuid, uuid) to authenticated;
grant execute on function public.create_household_category_by_kind(uuid, uuid, text, text) to authenticated;
grant execute on function public.create_household_category_simple(uuid, uuid, text, text) to authenticated;

revoke execute on function public.list_household_categories(uuid, uuid) from public;
revoke execute on function public.create_household_category_by_kind(uuid, uuid, text, text) from public;
revoke execute on function public.create_household_category_simple(uuid, uuid, text, text) from public;

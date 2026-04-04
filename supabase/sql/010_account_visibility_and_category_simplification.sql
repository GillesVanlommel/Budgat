create or replace function public.current_household_member_id(
  p_household_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select hm.id
  from public.household_members hm
  where hm.household_id = p_household_id
    and hm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_view_household_account(
  p_household_id uuid,
  p_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.accounts a
    where a.id = p_account_id
      and a.household_id = p_household_id
      and (
        a.owner_member_id is null
        or a.owner_member_id = public.current_household_member_id(p_household_id)
      )
  );
$$;

create or replace function public.list_household_accounts(
  p_household_id uuid
)
returns table (
  account_id uuid,
  household_id uuid,
  name text,
  account_type public.account_type,
  opening_balance numeric,
  include_in_budget boolean,
  archived boolean,
  owner_member_id uuid,
  owner_display_name text,
  owner_role public.household_member_role,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id as account_id,
    a.household_id,
    a.name,
    a.account_type,
    a.opening_balance,
    a.include_in_budget,
    a.archived,
    a.owner_member_id,
    hm.display_name as owner_display_name,
    hm.role as owner_role,
    a.created_at,
    a.updated_at
  from public.accounts a
  left join public.household_members hm on hm.id = a.owner_member_id
  where a.household_id = p_household_id
    and public.is_household_member(p_household_id)
    and (
      a.owner_member_id is null
      or a.owner_member_id = public.current_household_member_id(p_household_id)
    )
  order by a.archived asc, lower(a.name) asc, a.created_at asc;
$$;

create or replace function public.list_recent_household_transactions(
  p_household_id uuid,
  p_limit integer default 10
)
returns table (
  transaction_id uuid,
  household_id uuid,
  transaction_date date,
  kind public.household_transaction_kind,
  description text,
  notes text,
  amount numeric,
  is_cleared boolean,
  account_id uuid,
  account_name text,
  to_account_id uuid,
  to_account_name text,
  category_id uuid,
  category_name text,
  category_kind_key text,
  category_flow_type public.category_flow_type,
  entered_by_user_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ht.id as transaction_id,
    ht.household_id,
    ht.transaction_date,
    ht.kind,
    ht.description,
    ht.notes,
    ht.amount,
    ht.is_cleared,
    ht.account_id,
    case
      when public.can_view_household_account(p_household_id, ht.account_id) then source_account.name
      else 'Hidden personal account'
    end as account_name,
    ht.to_account_id,
    case
      when ht.to_account_id is null then null
      when public.can_view_household_account(p_household_id, ht.to_account_id) then destination_account.name
      else 'Hidden personal account'
    end as to_account_name,
    ht.category_id,
    hc.name as category_name,
    ck.key as category_kind_key,
    ck.flow_type as category_flow_type,
    ht.entered_by_user_id,
    ht.created_at
  from public.household_transactions ht
  join public.accounts source_account on source_account.id = ht.account_id
  left join public.accounts destination_account on destination_account.id = ht.to_account_id
  left join public.household_categories hc on hc.id = ht.category_id
  left join public.category_kinds ck on ck.id = hc.category_kind_id
  where ht.household_id = p_household_id
    and public.is_household_member(p_household_id)
    and (
      public.can_view_household_account(p_household_id, ht.account_id)
      or (
        ht.to_account_id is not null
        and public.can_view_household_account(p_household_id, ht.to_account_id)
      )
    )
  order by ht.transaction_date desc, ht.created_at desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.list_household_transactions(
  p_household_id uuid,
  p_search text default null,
  p_kind public.household_transaction_kind default null,
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_month date default null,
  p_limit integer default 200
)
returns table (
  transaction_id uuid,
  household_id uuid,
  transaction_date date,
  kind public.household_transaction_kind,
  description text,
  notes text,
  amount numeric,
  is_cleared boolean,
  account_id uuid,
  account_name text,
  to_account_id uuid,
  to_account_name text,
  category_id uuid,
  category_name text,
  category_kind_key text,
  category_kind_name text,
  category_flow_type public.category_flow_type,
  entered_by_user_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ht.id as transaction_id,
    ht.household_id,
    ht.transaction_date,
    ht.kind,
    ht.description,
    ht.notes,
    ht.amount,
    ht.is_cleared,
    ht.account_id,
    case
      when public.can_view_household_account(p_household_id, ht.account_id) then source_account.name
      else 'Hidden personal account'
    end as account_name,
    ht.to_account_id,
    case
      when ht.to_account_id is null then null
      when public.can_view_household_account(p_household_id, ht.to_account_id) then destination_account.name
      else 'Hidden personal account'
    end as to_account_name,
    ht.category_id,
    hc.name as category_name,
    ck.key as category_kind_key,
    ck.display_name as category_kind_name,
    ck.flow_type as category_flow_type,
    ht.entered_by_user_id,
    ht.created_at
  from public.household_transactions ht
  join public.accounts source_account on source_account.id = ht.account_id
  left join public.accounts destination_account on destination_account.id = ht.to_account_id
  left join public.household_categories hc on hc.id = ht.category_id
  left join public.category_kinds ck on ck.id = hc.category_kind_id
  where ht.household_id = p_household_id
    and public.is_household_member(p_household_id)
    and (
      public.can_view_household_account(p_household_id, ht.account_id)
      or (
        ht.to_account_id is not null
        and public.can_view_household_account(p_household_id, ht.to_account_id)
      )
    )
    and (
      p_search is null
      or btrim(p_search) = ''
      or lower(ht.description) like '%' || lower(btrim(p_search)) || '%'
      or lower(coalesce(ht.notes, '')) like '%' || lower(btrim(p_search)) || '%'
      or lower(coalesce(hc.name, '')) like '%' || lower(btrim(p_search)) || '%'
      or lower(source_account.name) like '%' || lower(btrim(p_search)) || '%'
      or lower(coalesce(destination_account.name, '')) like '%' || lower(btrim(p_search)) || '%'
    )
    and (p_kind is null or ht.kind = p_kind)
    and (
      p_account_id is null
      or ht.account_id = p_account_id
      or ht.to_account_id = p_account_id
    )
    and (p_category_id is null or ht.category_id = p_category_id)
    and (
      p_month is null
      or date_trunc('month', ht.transaction_date::timestamp)::date = date_trunc('month', p_month::timestamp)::date
    )
  order by ht.transaction_date desc, ht.created_at desc
  limit greatest(coalesce(p_limit, 200), 1);
$$;

create or replace function public.list_household_account_balances(
  p_household_id uuid
)
returns table (
  account_id uuid,
  account_name text,
  account_type public.account_type,
  owner_member_id uuid,
  owner_display_name text,
  include_in_budget boolean,
  archived boolean,
  opening_balance numeric,
  current_balance numeric,
  latest_reconciliation_id uuid,
  latest_reconciliation_date date,
  latest_actual_balance numeric,
  latest_expected_balance numeric,
  latest_difference_amount numeric,
  latest_is_matched boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id as account_id,
    a.name as account_name,
    a.account_type,
    a.owner_member_id,
    hm.display_name as owner_display_name,
    a.include_in_budget,
    a.archived,
    a.opening_balance,
    public.account_calculated_balance(a.id, current_date) as current_balance,
    latest.id as latest_reconciliation_id,
    latest.reconciliation_date as latest_reconciliation_date,
    latest.actual_balance as latest_actual_balance,
    case
      when latest.id is null then null
      else public.account_calculated_balance(a.id, latest.reconciliation_date)
    end as latest_expected_balance,
    case
      when latest.id is null then null
      else latest.actual_balance - public.account_calculated_balance(a.id, latest.reconciliation_date)
    end as latest_difference_amount,
    case
      when latest.id is null then null
      else abs(latest.actual_balance - public.account_calculated_balance(a.id, latest.reconciliation_date)) < 0.05
    end as latest_is_matched
  from public.accounts a
  left join public.household_members hm on hm.id = a.owner_member_id
  left join lateral (
    select ar.id, ar.reconciliation_date, ar.actual_balance
    from public.account_reconciliations ar
    where ar.account_id = a.id
    order by ar.reconciliation_date desc, ar.created_at desc
    limit 1
  ) latest on true
  where a.household_id = p_household_id
    and public.is_household_member(p_household_id)
    and (
      a.owner_member_id is null
      or a.owner_member_id = public.current_household_member_id(p_household_id)
    )
  order by a.archived asc, a.name asc;
$$;

create or replace function public.list_account_reconciliations(
  p_household_id uuid,
  p_account_id uuid
)
returns table (
  reconciliation_id uuid,
  household_id uuid,
  account_id uuid,
  reconciliation_date date,
  actual_balance numeric,
  expected_balance numeric,
  difference_amount numeric,
  is_matched boolean,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ar.id as reconciliation_id,
    ar.household_id,
    ar.account_id,
    ar.reconciliation_date,
    ar.actual_balance,
    public.account_calculated_balance(ar.account_id, ar.reconciliation_date) as expected_balance,
    ar.actual_balance - public.account_calculated_balance(ar.account_id, ar.reconciliation_date) as difference_amount,
    abs(ar.actual_balance - public.account_calculated_balance(ar.account_id, ar.reconciliation_date)) < 0.05 as is_matched,
    ar.notes,
    ar.created_by_user_id,
    ar.created_at
  from public.account_reconciliations ar
  where ar.household_id = p_household_id
    and ar.account_id = p_account_id
    and public.is_household_member(p_household_id)
    and public.can_view_household_account(p_household_id, p_account_id)
  order by ar.reconciliation_date desc, ar.created_at desc;
$$;

create or replace function public.upsert_account_reconciliation(
  p_household_id uuid,
  p_account_id uuid,
  p_reconciliation_date date,
  p_actual_balance numeric,
  p_notes text default null
)
returns public.account_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_reconciliation public.account_reconciliations;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'You do not have access to this household';
  end if;

  if not public.can_view_household_account(p_household_id, p_account_id) then
    raise exception 'You cannot reconcile this account';
  end if;

  if p_reconciliation_date is null then
    raise exception 'Reconciliation date is required';
  end if;

  if p_actual_balance is null then
    raise exception 'Actual balance is required';
  end if;

  if not exists (
    select 1
    from public.accounts a
    where a.id = p_account_id
      and a.household_id = p_household_id
  ) then
    raise exception 'Account does not belong to this household';
  end if;

  insert into public.account_reconciliations (
    household_id,
    account_id,
    reconciliation_date,
    actual_balance,
    notes,
    created_by_user_id
  )
  values (
    p_household_id,
    p_account_id,
    p_reconciliation_date,
    p_actual_balance,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  on conflict (account_id, reconciliation_date)
  do update set
    actual_balance = excluded.actual_balance,
    notes = excluded.notes,
    created_by_user_id = v_user_id
  returning * into v_reconciliation;

  return v_reconciliation;
end;
$$;

create or replace function public.delete_account_reconciliation(
  p_reconciliation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_account_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select household_id, account_id
  into v_household_id, v_account_id
  from public.account_reconciliations
  where id = p_reconciliation_id;

  if v_household_id is null then
    return;
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception 'You do not have access to this household';
  end if;

  if not public.can_view_household_account(v_household_id, v_account_id) then
    raise exception 'You cannot delete checkpoints for this account';
  end if;

  delete from public.account_reconciliations
  where id = p_reconciliation_id;
end;
$$;

create or replace function public.create_household_category_simple(
  p_household_id uuid,
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
    p_name,
    v_kind_key
  );
end;
$$;

grant execute on function public.current_household_member_id(uuid) to authenticated;
grant execute on function public.can_view_household_account(uuid, uuid) to authenticated;
grant execute on function public.create_household_category_simple(uuid, text, text) to authenticated;

revoke execute on function public.current_household_member_id(uuid) from public;
revoke execute on function public.can_view_household_account(uuid, uuid) from public;
revoke execute on function public.create_household_category_simple(uuid, text, text) from public;

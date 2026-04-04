create or replace function public.account_calculated_balance(
  p_account_id uuid,
  p_as_of_date date default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round((
    coalesce(a.opening_balance, 0)
    + coalesce(
      sum(
        case
          when ht.account_id = a.id and ht.kind = 'income' then ht.amount
          when ht.account_id = a.id and ht.kind in ('expense', 'transfer') then -ht.amount
          when ht.to_account_id = a.id and ht.kind = 'transfer' then ht.amount
          else 0
        end
      ),
      0
    )
  )::numeric, 2)
  from public.accounts a
  left join public.household_transactions ht
    on ht.household_id = a.household_id
   and ht.transaction_date <= coalesce(p_as_of_date, current_date)
   and (ht.account_id = a.id or ht.to_account_id = a.id)
  where a.id = p_account_id
    and public.is_household_member(a.household_id)
  group by a.id, a.opening_balance;
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select household_id
  into v_household_id
  from public.account_reconciliations
  where id = p_reconciliation_id;

  if v_household_id is null then
    return;
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception 'You do not have access to this household';
  end if;

  delete from public.account_reconciliations
  where id = p_reconciliation_id;
end;
$$;

grant execute on function public.list_household_account_balances(uuid) to authenticated;
grant execute on function public.list_account_reconciliations(uuid, uuid) to authenticated;
grant execute on function public.upsert_account_reconciliation(uuid, uuid, date, numeric, text) to authenticated;
grant execute on function public.delete_account_reconciliation(uuid) to authenticated;

revoke execute on function public.account_calculated_balance(uuid, date) from public;
revoke execute on function public.list_household_account_balances(uuid) from public;
revoke execute on function public.list_account_reconciliations(uuid, uuid) from public;
revoke execute on function public.upsert_account_reconciliation(uuid, uuid, date, numeric, text) from public;
revoke execute on function public.delete_account_reconciliation(uuid) from public;

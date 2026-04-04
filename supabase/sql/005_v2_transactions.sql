create or replace function public.create_household_transaction(
  p_household_id uuid,
  p_transaction_date date,
  p_kind public.household_transaction_kind,
  p_description text,
  p_notes text default null,
  p_amount numeric default null,
  p_account_id uuid default null,
  p_to_account_id uuid default null,
  p_category_id uuid default null,
  p_is_cleared boolean default false
)
returns public.household_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_description text;
  v_amount numeric;
  v_tx public.household_transactions;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'You do not have access to this household';
  end if;

  v_description := nullif(btrim(p_description), '');
  if v_description is null then
    raise exception 'Description is required';
  end if;

  v_amount := coalesce(p_amount, 0);
  if v_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if p_transaction_date is null then
    raise exception 'Transaction date is required';
  end if;

  insert into public.household_transactions (
    household_id,
    entered_by_user_id,
    transaction_date,
    kind,
    description,
    notes,
    amount,
    account_id,
    to_account_id,
    category_id,
    is_cleared
  )
  values (
    p_household_id,
    v_user_id,
    p_transaction_date,
    p_kind,
    v_description,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_amount,
    p_account_id,
    p_to_account_id,
    p_category_id,
    coalesce(p_is_cleared, false)
  )
  returning * into v_tx;

  return v_tx;
end;
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
    source_account.name as account_name,
    ht.to_account_id,
    destination_account.name as to_account_name,
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
  order by ht.transaction_date desc, ht.created_at desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

grant execute on function public.create_household_transaction(uuid, date, public.household_transaction_kind, text, text, numeric, uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.list_recent_household_transactions(uuid, integer) to authenticated;

revoke execute on function public.create_household_transaction(uuid, date, public.household_transaction_kind, text, text, numeric, uuid, uuid, uuid, boolean) from public;
revoke execute on function public.list_recent_household_transactions(uuid, integer) from public;

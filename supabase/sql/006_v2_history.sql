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
    source_account.name as account_name,
    ht.to_account_id,
    destination_account.name as to_account_name,
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

grant execute on function public.list_household_transactions(uuid, text, public.household_transaction_kind, uuid, uuid, date, integer) to authenticated;
revoke execute on function public.list_household_transactions(uuid, text, public.household_transaction_kind, uuid, uuid, date, integer) from public;

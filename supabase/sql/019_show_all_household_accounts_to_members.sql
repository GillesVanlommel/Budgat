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
  order by a.archived asc, lower(a.name) asc, a.created_at asc;
$$;

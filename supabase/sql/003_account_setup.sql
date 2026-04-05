create or replace function public.list_household_members(
  p_household_id uuid
)
returns table (
  member_id uuid,
  user_id uuid,
  role public.household_member_role,
  display_name text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    hm.id as member_id,
    hm.user_id,
    hm.role,
    hm.display_name,
    hm.joined_at
  from public.household_members hm
  where hm.household_id = p_household_id
    and public.is_household_member(p_household_id)
  order by
    case hm.role
      when 'owner' then 1
      when 'admin' then 2
      else 3
    end,
    coalesce(hm.display_name, ''),
    hm.joined_at;
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
  order by a.archived asc, lower(a.name) asc, a.created_at asc;
$$;

create or replace function public.create_household_account(
  p_household_id uuid,
  p_name text,
  p_account_type public.account_type,
  p_owner_member_id uuid default null,
  p_opening_balance numeric default 0,
  p_include_in_budget boolean default true
)
returns public.accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_account_name text;
  v_account public.accounts;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Only household members can create accounts';
  end if;

  v_account_name := nullif(btrim(p_name), '');
  if v_account_name is null then
    raise exception 'Account name is required';
  end if;

  insert into public.accounts (
    household_id,
    owner_member_id,
    name,
    account_type,
    opening_balance,
    include_in_budget
  )
  values (
    p_household_id,
    p_owner_member_id,
    v_account_name,
    p_account_type,
    coalesce(p_opening_balance, 0),
    coalesce(p_include_in_budget, true)
  )
  returning * into v_account;

  return v_account;
end;
$$;

grant execute on function public.list_household_members(uuid) to authenticated;
grant execute on function public.list_household_accounts(uuid) to authenticated;
grant execute on function public.create_household_account(uuid, text, public.account_type, uuid, numeric, boolean) to authenticated;

revoke execute on function public.list_household_members(uuid) from public;
revoke execute on function public.list_household_accounts(uuid) from public;
revoke execute on function public.create_household_account(uuid, text, public.account_type, uuid, numeric, boolean) from public;

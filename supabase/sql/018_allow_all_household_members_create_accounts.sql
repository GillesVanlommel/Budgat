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

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
  v_current_member_id uuid;
  v_category_name text;
  v_kind_key text;
  v_category_kind_id uuid;
  v_account_household_id uuid;
  v_account_owner_member_id uuid;
  v_category public.household_categories;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Only household members can create categories';
  end if;

  select hm.id
    into v_current_member_id
  from public.household_members hm
  where hm.household_id = p_household_id
    and hm.user_id = v_user_id
  limit 1;

  if v_current_member_id is null then
    raise exception 'Only household members can create categories';
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

  select
    a.household_id,
    a.owner_member_id
    into v_account_household_id,
      v_account_owner_member_id
  from public.accounts a
  where a.id = p_account_id;

  if v_account_household_id is null then
    raise exception 'Account is required for account-based categories';
  end if;

  if v_account_household_id <> p_household_id then
    raise exception 'Account must belong to the same household';
  end if;

  if v_account_owner_member_id is distinct from v_current_member_id then
    raise exception 'You can only create categories for your own accounts';
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
  v_user_id uuid;
  v_current_member_id uuid;
  v_category_name text;
  v_flow_type public.category_flow_type;
  v_category_kind_id uuid;
  v_account_household_id uuid;
  v_account_owner_member_id uuid;
  v_category public.household_categories;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(p_household_id) then
    raise exception 'Only household members can create categories';
  end if;

  select hm.id
    into v_current_member_id
  from public.household_members hm
  where hm.household_id = p_household_id
    and hm.user_id = v_user_id
  limit 1;

  if v_current_member_id is null then
    raise exception 'Only household members can create categories';
  end if;

  v_category_name := nullif(btrim(p_name), '');
  if v_category_name is null then
    raise exception 'Category name is required';
  end if;

  if lower(coalesce(btrim(p_flow_type), '')) = 'transfer' then
    raise exception 'Transfer categories are not needed. Transfers are tracked between accounts.';
  end if;

  begin
    v_flow_type := lower(coalesce(btrim(p_flow_type), ''))::public.category_flow_type;
  exception
    when others then
      raise exception 'Category type must be expense or income';
  end;

  select
    a.household_id,
    a.owner_member_id
    into v_account_household_id,
      v_account_owner_member_id
  from public.accounts a
  where a.id = p_account_id;

  if v_account_household_id is null then
    raise exception 'Account is required for account-based categories';
  end if;

  if v_account_household_id <> p_household_id then
    raise exception 'Account must belong to the same household';
  end if;

  if v_account_owner_member_id is distinct from v_current_member_id then
    raise exception 'You can only create categories for your own accounts';
  end if;

  v_category_kind_id := public.ensure_default_category_kind(v_flow_type);

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

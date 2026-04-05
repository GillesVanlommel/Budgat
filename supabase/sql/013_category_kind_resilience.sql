create or replace function public.ensure_default_category_kind(
  p_flow_type public.category_flow_type
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind_id uuid;
  v_kind_key text;
  v_display_name text;
  v_budgetable boolean;
  v_system_order integer;
begin
  if p_flow_type = 'expense' then
    v_kind_key := 'household_misc';
    v_display_name := 'Household Misc';
    v_budgetable := true;
    v_system_order := 210;
  elsif p_flow_type = 'income' then
    v_kind_key := 'other_income';
    v_display_name := 'Other Income';
    v_budgetable := false;
    v_system_order := 370;
  else
    raise exception 'Unsupported category flow type: %', p_flow_type;
  end if;

  insert into public.category_kinds (key, display_name, flow_type, budgetable, system_order)
  values (v_kind_key, v_display_name, p_flow_type, v_budgetable, v_system_order)
  on conflict (key)
  do update set
    display_name = excluded.display_name,
    flow_type = excluded.flow_type,
    budgetable = excluded.budgetable,
    system_order = excluded.system_order
  returning id into v_kind_id;

  return v_kind_id;
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

grant execute on function public.ensure_default_category_kind(public.category_flow_type) to authenticated;
grant execute on function public.create_household_category_simple(uuid, uuid, text, text) to authenticated;

revoke execute on function public.ensure_default_category_kind(public.category_flow_type) from public;
revoke execute on function public.create_household_category_simple(uuid, uuid, text, text) from public;

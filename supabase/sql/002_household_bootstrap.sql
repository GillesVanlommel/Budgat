create or replace function public.create_household(
  p_name text,
  p_base_currency text default 'EUR',
  p_owner_display_name text default null
)
returns table (
  household_id uuid,
  member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_household_id uuid;
  v_member_id uuid;
  v_name text;
  v_currency text;
  v_display_name text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_name := nullif(btrim(p_name), '');
  if v_name is null then
    raise exception 'Household name is required';
  end if;

  v_currency := upper(coalesce(nullif(btrim(p_base_currency), ''), 'EUR'));
  if char_length(v_currency) <> 3 then
    raise exception 'Base currency must be a 3-letter currency code';
  end if;

  v_display_name := nullif(btrim(p_owner_display_name), '');

  insert into public.households (name, base_currency, created_by_user_id)
  values (v_name, v_currency, v_user_id)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, v_user_id, 'owner', v_display_name)
  returning id into v_member_id;

  household_id := v_household_id;
  member_id := v_member_id;
  return next;
end;
$$;

create or replace function public.list_my_households()
returns table (
  household_id uuid,
  household_name text,
  base_currency text,
  member_id uuid,
  member_role public.household_member_role,
  member_display_name text,
  joined_at timestamptz,
  accounts_count bigint,
  categories_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.id as household_id,
    h.name as household_name,
    h.base_currency,
    hm.id as member_id,
    hm.role as member_role,
    hm.display_name as member_display_name,
    hm.joined_at,
    (
      select count(*)
      from public.accounts a
      where a.household_id = h.id
        and a.archived = false
    ) as accounts_count,
    (
      select count(*)
      from public.household_categories hc
      where hc.household_id = h.id
        and hc.archived = false
    ) as categories_count
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid()
  order by h.created_at asc, hm.joined_at asc;
$$;

create or replace function public.create_household_category_by_kind(
  p_household_id uuid,
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

  insert into public.household_categories (
    household_id,
    created_by_user_id,
    name,
    category_kind_id
  )
  values (
    p_household_id,
    v_user_id,
    v_category_name,
    v_category_kind_id
  )
  returning * into v_category;

  return v_category;
end;
$$;

grant execute on function public.create_household(text, text, text) to authenticated;
grant execute on function public.list_my_households() to authenticated;
grant execute on function public.create_household_category_by_kind(uuid, text, text) to authenticated;
revoke execute on function public.create_household(text, text, text) from public;
revoke execute on function public.list_my_households() from public;
revoke execute on function public.create_household_category_by_kind(uuid, text, text) from public;

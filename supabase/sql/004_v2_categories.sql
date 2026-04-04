create or replace function public.list_category_kinds()
returns table (
  category_kind_id uuid,
  key text,
  display_name text,
  flow_type public.category_flow_type,
  budgetable boolean,
  system_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ck.id as category_kind_id,
    ck.key,
    ck.display_name,
    ck.flow_type,
    ck.budgetable,
    ck.system_order
  from public.category_kinds ck
  order by ck.system_order asc, ck.display_name asc;
$$;

create or replace function public.list_household_categories(
  p_household_id uuid
)
returns table (
  category_id uuid,
  household_id uuid,
  name text,
  archived boolean,
  created_at timestamptz,
  updated_at timestamptz,
  category_kind_id uuid,
  category_kind_key text,
  category_kind_name text,
  flow_type public.category_flow_type,
  budgetable boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    hc.id as category_id,
    hc.household_id,
    hc.name,
    hc.archived,
    hc.created_at,
    hc.updated_at,
    ck.id as category_kind_id,
    ck.key as category_kind_key,
    ck.display_name as category_kind_name,
    ck.flow_type,
    ck.budgetable
  from public.household_categories hc
  join public.category_kinds ck on ck.id = hc.category_kind_id
  where hc.household_id = p_household_id
    and public.is_household_member(p_household_id)
  order by hc.archived asc, lower(hc.name) asc, hc.created_at asc;
$$;

grant execute on function public.list_category_kinds() to authenticated;
grant execute on function public.list_household_categories(uuid) to authenticated;

revoke execute on function public.list_category_kinds() from public;
revoke execute on function public.list_household_categories(uuid) from public;

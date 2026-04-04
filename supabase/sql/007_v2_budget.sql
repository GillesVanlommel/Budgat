create or replace function public.set_household_budget_line(
  p_household_id uuid,
  p_month date,
  p_category_id uuid,
  p_planned_amount numeric
)
returns public.budget_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_month date;
  v_budget_month_id uuid;
  v_budget_line public.budget_lines;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Only household admins can manage monthly budgets';
  end if;

  if p_category_id is null then
    raise exception 'Category is required';
  end if;

  if p_month is null then
    raise exception 'Budget month is required';
  end if;

  if coalesce(p_planned_amount, 0) < 0 then
    raise exception 'Planned amount cannot be negative';
  end if;

  v_month := date_trunc('month', p_month::timestamp)::date;

  insert into public.budget_months (
    household_id,
    month_date,
    created_by_user_id
  )
  values (
    p_household_id,
    v_month,
    v_user_id
  )
  on conflict (household_id, month_date) do update
    set updated_at = now()
  returning id into v_budget_month_id;

  insert into public.budget_lines (
    budget_month_id,
    household_id,
    category_id,
    planned_amount
  )
  values (
    v_budget_month_id,
    p_household_id,
    p_category_id,
    coalesce(p_planned_amount, 0)
  )
  on conflict (budget_month_id, category_id) do update
    set planned_amount = excluded.planned_amount,
        updated_at = now()
  returning * into v_budget_line;

  return v_budget_line;
end;
$$;

create or replace function public.list_budget_month_lines(
  p_household_id uuid,
  p_month date
)
returns table (
  month_date date,
  category_id uuid,
  category_name text,
  category_kind_key text,
  category_kind_name text,
  planned_amount numeric,
  actual_amount numeric,
  remaining_amount numeric,
  over_budget boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with selected_month as (
    select date_trunc('month', p_month::timestamp)::date as month_date
  ),
  expense_categories as (
    select
      hc.id as category_id,
      hc.name as category_name,
      ck.key as category_kind_key,
      ck.display_name as category_kind_name
    from public.household_categories hc
    join public.category_kinds ck on ck.id = hc.category_kind_id
    where hc.household_id = p_household_id
      and hc.archived = false
      and ck.flow_type = 'expense'
      and ck.budgetable = true
  ),
  selected_budget_month as (
    select bm.id, bm.month_date
    from public.budget_months bm
    join selected_month sm on sm.month_date = bm.month_date
    where bm.household_id = p_household_id
  ),
  planned as (
    select
      bl.category_id,
      bl.planned_amount
    from public.budget_lines bl
    join selected_budget_month bm on bm.id = bl.budget_month_id
  ),
  actuals as (
    select
      ht.category_id,
      sum(ht.amount)::numeric as actual_amount
    from public.household_transactions ht
    join selected_month sm on date_trunc('month', ht.transaction_date::timestamp)::date = sm.month_date
    where ht.household_id = p_household_id
      and ht.kind = 'expense'
      and ht.category_id is not null
    group by ht.category_id
  )
  select
    sm.month_date,
    ec.category_id,
    ec.category_name,
    ec.category_kind_key,
    ec.category_kind_name,
    coalesce(p.planned_amount, 0)::numeric as planned_amount,
    coalesce(a.actual_amount, 0)::numeric as actual_amount,
    (coalesce(p.planned_amount, 0) - coalesce(a.actual_amount, 0))::numeric as remaining_amount,
    (coalesce(a.actual_amount, 0) > coalesce(p.planned_amount, 0)) as over_budget
  from selected_month sm
  cross join expense_categories ec
  left join planned p on p.category_id = ec.category_id
  left join actuals a on a.category_id = ec.category_id
  where public.is_household_member(p_household_id)
  order by lower(ec.category_name) asc;
$$;

grant execute on function public.set_household_budget_line(uuid, date, uuid, numeric) to authenticated;
grant execute on function public.list_budget_month_lines(uuid, date) to authenticated;

revoke execute on function public.set_household_budget_line(uuid, date, uuid, numeric) from public;
revoke execute on function public.list_budget_month_lines(uuid, date) from public;

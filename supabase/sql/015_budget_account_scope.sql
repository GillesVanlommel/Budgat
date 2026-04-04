drop function if exists public.list_budget_month_lines(uuid, date);

create or replace function public.list_budget_month_lines(
  p_household_id uuid,
  p_month date,
  p_account_id uuid
)
returns table (
  month_date date,
  account_id uuid,
  account_name text,
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
  selected_account as (
    select a.id, a.name
    from public.accounts a
    where a.id = p_account_id
      and a.household_id = p_household_id
      and a.archived = false
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
      and hc.account_id = p_account_id
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
      and ht.account_id = p_account_id
      and ht.kind = 'expense'
      and ht.category_id is not null
    group by ht.category_id
  )
  select
    sm.month_date,
    sa.id as account_id,
    sa.name as account_name,
    ec.category_id,
    ec.category_name,
    ec.category_kind_key,
    ec.category_kind_name,
    coalesce(p.planned_amount, 0)::numeric as planned_amount,
    coalesce(a.actual_amount, 0)::numeric as actual_amount,
    (coalesce(p.planned_amount, 0) - coalesce(a.actual_amount, 0))::numeric as remaining_amount,
    (coalesce(a.actual_amount, 0) > coalesce(p.planned_amount, 0)) as over_budget
  from selected_month sm
  join selected_account sa on true
  cross join expense_categories ec
  left join planned p on p.category_id = ec.category_id
  left join actuals a on a.category_id = ec.category_id
  where public.is_household_member(p_household_id)
    and public.can_view_household_account(p_household_id, p_account_id)
  order by lower(ec.category_name) asc;
$$;

grant execute on function public.list_budget_month_lines(uuid, date, uuid) to authenticated;
revoke execute on function public.list_budget_month_lines(uuid, date, uuid) from public;

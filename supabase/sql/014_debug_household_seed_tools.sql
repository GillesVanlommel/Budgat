create or replace function public.debug_reset_household_to_base(
  p_household_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_deleted_reconciliations integer := 0;
  v_deleted_transactions integer := 0;
  v_deleted_budget_lines integer := 0;
  v_deleted_budget_months integer := 0;
  v_deleted_categories integer := 0;
  v_deleted_accounts integer := 0;
  v_created_accounts integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Only owner/admin can run debug reset';
  end if;

  delete from public.account_reconciliations
  where household_id = p_household_id;
  get diagnostics v_deleted_reconciliations = row_count;

  delete from public.household_transactions
  where household_id = p_household_id;
  get diagnostics v_deleted_transactions = row_count;

  delete from public.budget_lines
  where household_id = p_household_id;
  get diagnostics v_deleted_budget_lines = row_count;

  delete from public.budget_months
  where household_id = p_household_id;
  get diagnostics v_deleted_budget_months = row_count;

  delete from public.household_categories
  where household_id = p_household_id;
  get diagnostics v_deleted_categories = row_count;

  delete from public.accounts
  where household_id = p_household_id;
  get diagnostics v_deleted_accounts = row_count;

  with members as (
    select
      hm.id as member_id,
      coalesce(nullif(btrim(hm.display_name), ''), 'Member') as base_name,
      row_number() over (
        partition by coalesce(nullif(btrim(hm.display_name), ''), 'Member')
        order by hm.joined_at asc, hm.id asc
      ) as name_seq,
      count(*) over (
        partition by coalesce(nullif(btrim(hm.display_name), ''), 'Member')
      ) as name_count
    from public.household_members hm
    where hm.household_id = p_household_id
  ),
  inserted as (
    insert into public.accounts (
      household_id,
      owner_member_id,
      name,
      account_type,
      opening_balance,
      include_in_budget
    )
    select
      p_household_id,
      m.member_id,
      case
        when m.name_count > 1 then m.base_name || ' Checking ' || m.name_seq::text
        else m.base_name || ' Checking'
      end,
      'checking'::public.account_type,
      0,
      true
    from members m
    returning id
  )
  select count(*)
    into v_created_accounts
  from inserted;

  return jsonb_build_object(
    'deleted_reconciliations', v_deleted_reconciliations,
    'deleted_transactions', v_deleted_transactions,
    'deleted_budget_lines', v_deleted_budget_lines,
    'deleted_budget_months', v_deleted_budget_months,
    'deleted_categories', v_deleted_categories,
    'deleted_accounts', v_deleted_accounts,
    'created_base_accounts', v_created_accounts
  );
end;
$$;

create or replace function public.debug_seed_household_mock_data(
  p_household_id uuid,
  p_days integer default 60,
  p_transactions_per_account integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_days integer;
  v_tx_per_account integer;
  v_expense_kind_id uuid;
  v_income_kind_id uuid;
  v_account record;
  v_category_salary_id uuid;
  v_category_groceries_id uuid;
  v_category_transport_id uuid;
  v_category_house_id uuid;
  v_category_misc_id uuid;
  v_loop integer;
  v_income_tx_count integer := 0;
  v_expense_tx_count integer := 0;
  v_transfer_tx_count integer := 0;
  v_created_category_count integer := 0;
  v_primary_account_id uuid;
  v_secondary_account_id uuid;
  v_first_day date;
  v_date date;
  v_amount numeric(14,2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Only owner/admin can run debug seed';
  end if;

  v_days := greatest(coalesce(p_days, 60), 7);
  v_tx_per_account := greatest(coalesce(p_transactions_per_account, 30), 5);

  perform public.debug_reset_household_to_base(p_household_id);

  v_expense_kind_id := public.ensure_default_category_kind('expense'::public.category_flow_type);
  v_income_kind_id := public.ensure_default_category_kind('income'::public.category_flow_type);

  for v_account in
    select a.id as account_id
    from public.accounts a
    where a.household_id = p_household_id
      and a.archived = false
    order by a.created_at asc, a.id asc
  loop
    insert into public.household_categories (household_id, account_id, created_by_user_id, name, category_kind_id)
    values (p_household_id, v_account.account_id, v_user_id, 'Salary', v_income_kind_id)
    returning id into v_category_salary_id;

    insert into public.household_categories (household_id, account_id, created_by_user_id, name, category_kind_id)
    values (p_household_id, v_account.account_id, v_user_id, 'Groceries', v_expense_kind_id)
    returning id into v_category_groceries_id;

    insert into public.household_categories (household_id, account_id, created_by_user_id, name, category_kind_id)
    values (p_household_id, v_account.account_id, v_user_id, 'Transport', v_expense_kind_id)
    returning id into v_category_transport_id;

    insert into public.household_categories (household_id, account_id, created_by_user_id, name, category_kind_id)
    values (p_household_id, v_account.account_id, v_user_id, 'Housing', v_expense_kind_id)
    returning id into v_category_house_id;

    insert into public.household_categories (household_id, account_id, created_by_user_id, name, category_kind_id)
    values (p_household_id, v_account.account_id, v_user_id, 'Misc', v_expense_kind_id)
    returning id into v_category_misc_id;

    v_created_category_count := v_created_category_count + 5;

    for v_loop in 0..2 loop
      v_first_day := (date_trunc('month', current_date::timestamp) - make_interval(months => v_loop))::date + 1;
      v_amount := round((2200 + random() * 900)::numeric, 2);

      insert into public.household_transactions (
        household_id,
        entered_by_user_id,
        transaction_date,
        kind,
        description,
        amount,
        account_id,
        category_id,
        is_cleared
      )
      values (
        p_household_id,
        v_user_id,
        v_first_day,
        'income'::public.household_transaction_kind,
        'Salary',
        v_amount,
        v_account.account_id,
        v_category_salary_id,
        true
      );

      v_income_tx_count := v_income_tx_count + 1;
    end loop;

    for v_loop in 1..v_tx_per_account loop
      v_date := current_date - floor(random() * v_days)::int;
      v_amount := round((8 + random() * 180)::numeric, 2);

      insert into public.household_transactions (
        household_id,
        entered_by_user_id,
        transaction_date,
        kind,
        description,
        amount,
        account_id,
        category_id,
        is_cleared
      )
      values (
        p_household_id,
        v_user_id,
        v_date,
        'expense'::public.household_transaction_kind,
        case
          when v_loop % 4 = 0 then 'Housing'
          when v_loop % 3 = 0 then 'Transport'
          when v_loop % 2 = 0 then 'Groceries'
          else 'Daily spend'
        end,
        v_amount,
        v_account.account_id,
        case
          when v_loop % 4 = 0 then v_category_house_id
          when v_loop % 3 = 0 then v_category_transport_id
          when v_loop % 2 = 0 then v_category_groceries_id
          else v_category_misc_id
        end,
        (v_loop % 2 = 0)
      );

      v_expense_tx_count := v_expense_tx_count + 1;
    end loop;
  end loop;

  select a.id
    into v_primary_account_id
  from public.accounts a
  where a.household_id = p_household_id
    and a.archived = false
  order by a.created_at asc, a.id asc
  limit 1;

  select a.id
    into v_secondary_account_id
  from public.accounts a
  where a.household_id = p_household_id
    and a.archived = false
  order by a.created_at asc, a.id asc
  offset 1
  limit 1;

  if v_primary_account_id is not null and v_secondary_account_id is not null then
    for v_loop in 1..8 loop
      v_date := current_date - (v_loop * 5);
      v_amount := round((40 + random() * 220)::numeric, 2);

      insert into public.household_transactions (
        household_id,
        entered_by_user_id,
        transaction_date,
        kind,
        description,
        amount,
        account_id,
        to_account_id,
        category_id,
        is_cleared
      )
      values (
        p_household_id,
        v_user_id,
        v_date,
        'transfer'::public.household_transaction_kind,
        'Transfer between personal accounts',
        v_amount,
        v_primary_account_id,
        v_secondary_account_id,
        null,
        true
      );

      v_transfer_tx_count := v_transfer_tx_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'created_categories', v_created_category_count,
    'created_income_transactions', v_income_tx_count,
    'created_expense_transactions', v_expense_tx_count,
    'created_transfer_transactions', v_transfer_tx_count
  );
end;
$$;

grant execute on function public.debug_reset_household_to_base(uuid) to authenticated;
grant execute on function public.debug_seed_household_mock_data(uuid, integer, integer) to authenticated;

revoke execute on function public.debug_reset_household_to_base(uuid) from public;
revoke execute on function public.debug_seed_household_mock_data(uuid, integer, integer) from public;

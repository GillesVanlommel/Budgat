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
      coalesce(
        nullif(btrim(hm.display_name), ''),
        nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(au.raw_user_meta_data ->> 'name'), ''),
        nullif(
          btrim(
            concat_ws(
              ' ',
              au.raw_user_meta_data ->> 'first_name',
              au.raw_user_meta_data ->> 'last_name'
            )
          ),
          ''
        ),
        nullif(btrim(au.raw_user_meta_data ->> 'preferred_username'), ''),
        nullif(btrim(split_part(au.email, '@', 1)), ''),
        'Member'
      ) as base_name,
      row_number() over (
        partition by coalesce(
          nullif(btrim(hm.display_name), ''),
          nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''),
          nullif(btrim(au.raw_user_meta_data ->> 'name'), ''),
          nullif(
            btrim(
              concat_ws(
                ' ',
                au.raw_user_meta_data ->> 'first_name',
                au.raw_user_meta_data ->> 'last_name'
              )
            ),
            ''
          ),
          nullif(btrim(au.raw_user_meta_data ->> 'preferred_username'), ''),
          nullif(btrim(split_part(au.email, '@', 1)), ''),
          'Member'
        )
        order by hm.joined_at asc, hm.id asc
      ) as name_seq,
      count(*) over (
        partition by coalesce(
          nullif(btrim(hm.display_name), ''),
          nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''),
          nullif(btrim(au.raw_user_meta_data ->> 'name'), ''),
          nullif(
            btrim(
              concat_ws(
                ' ',
                au.raw_user_meta_data ->> 'first_name',
                au.raw_user_meta_data ->> 'last_name'
              )
            ),
            ''
          ),
          nullif(btrim(au.raw_user_meta_data ->> 'preferred_username'), ''),
          nullif(btrim(split_part(au.email, '@', 1)), ''),
          'Member'
        )
      ) as name_count
    from public.household_members hm
    join auth.users au on au.id = hm.user_id
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

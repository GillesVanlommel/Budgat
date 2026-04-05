with candidate_accounts as (
  select
    a.id as account_id,
    a.household_id,
    nullif(btrim(hm.display_name), '') as display_name,
    nullif(btrim(split_part(au.email, '@', 1)), '') as email_local,
    row_number() over (
      partition by a.household_id, nullif(btrim(split_part(au.email, '@', 1)), '')
      order by hm.joined_at asc, hm.id asc
    ) as email_name_seq,
    count(*) over (
      partition by a.household_id, nullif(btrim(split_part(au.email, '@', 1)), '')
    ) as email_name_count,
    row_number() over (
      partition by a.household_id, nullif(btrim(hm.display_name), '')
      order by hm.joined_at asc, hm.id asc
    ) as display_name_seq,
    count(*) over (
      partition by a.household_id, nullif(btrim(hm.display_name), '')
    ) as display_name_count
  from public.accounts a
  join public.household_members hm
    on hm.id = a.owner_member_id
  join auth.users au
    on au.id = hm.user_id
  where a.account_type = 'checking'
    and a.owner_member_id is not null
    and a.archived = false
    and nullif(btrim(hm.display_name), '') is not null
    and nullif(btrim(split_part(au.email, '@', 1)), '') is not null
),
rename_candidates as (
  select
    c.account_id,
    c.household_id,
    case
      when c.email_name_count > 1 then c.email_local || ' Checking ' || c.email_name_seq::text
      else c.email_local || ' Checking'
    end as old_generated_name,
    case
      when c.display_name_count > 1 then c.display_name || ' Checking ' || c.display_name_seq::text
      else c.display_name || ' Checking'
    end as new_display_name
  from candidate_accounts c
)
update public.accounts a
set name = r.new_display_name
from rename_candidates r
where a.id = r.account_id
  and a.name = r.old_generated_name
  and lower(a.name) <> lower(r.new_display_name)
  and not exists (
    select 1
    from public.accounts other
    where other.household_id = r.household_id
      and other.id <> r.account_id
      and lower(other.name) = lower(r.new_display_name)
  );

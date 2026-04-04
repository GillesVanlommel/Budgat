create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  invite_code text not null unique,
  role public.household_member_role not null default 'member',
  created_by_user_id uuid not null references auth.users (id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_by_user_id uuid references auth.users (id),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint household_invites_expires_after_create check (expires_at > created_at)
);

create index if not exists household_invites_household_idx
  on public.household_invites (household_id, created_at desc);

create index if not exists household_invites_active_code_idx
  on public.household_invites (invite_code)
  where revoked_at is null and used_at is null;

alter table public.household_invites enable row level security;

drop policy if exists household_invites_select_admin on public.household_invites;
create policy household_invites_select_admin
on public.household_invites
for select
to authenticated
using (public.is_household_admin(household_id));

drop policy if exists household_invites_insert_admin on public.household_invites;
create policy household_invites_insert_admin
on public.household_invites
for insert
to authenticated
with check (public.is_household_admin(household_id));

drop policy if exists household_invites_update_admin on public.household_invites;
create policy household_invites_update_admin
on public.household_invites
for update
to authenticated
using (public.is_household_admin(household_id))
with check (public.is_household_admin(household_id));

create or replace function public.generate_household_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (
      select 1
      from public.household_invites hi
      where hi.invite_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

create or replace function public.create_household_invite(
  p_household_id uuid,
  p_role public.household_member_role default 'member',
  p_expires_days integer default 14
)
returns table (
  invite_id uuid,
  household_id uuid,
  invite_code text,
  role public.household_member_role,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_expires_days integer;
  v_invite public.household_invites;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_admin(p_household_id) then
    raise exception 'Only household admins can create invite codes';
  end if;

  if p_role = 'owner' then
    raise exception 'Invite role cannot be owner';
  end if;

  v_expires_days := coalesce(p_expires_days, 14);
  if v_expires_days < 1 or v_expires_days > 90 then
    raise exception 'Invite expiry must be between 1 and 90 days';
  end if;

  insert into public.household_invites (
    household_id,
    invite_code,
    role,
    created_by_user_id,
    expires_at
  )
  values (
    p_household_id,
    public.generate_household_invite_code(),
    p_role,
    v_user_id,
    now() + make_interval(days => v_expires_days)
  )
  returning * into v_invite;

  invite_id := v_invite.id;
  household_id := v_invite.household_id;
  invite_code := v_invite.invite_code;
  role := v_invite.role;
  expires_at := v_invite.expires_at;
  created_at := v_invite.created_at;
  return next;
end;
$$;

create or replace function public.list_household_invites(
  p_household_id uuid
)
returns table (
  invite_id uuid,
  invite_code text,
  role public.household_member_role,
  expires_at timestamptz,
  created_at timestamptz,
  revoked_at timestamptz,
  used_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    hi.id as invite_id,
    hi.invite_code,
    hi.role,
    hi.expires_at,
    hi.created_at,
    hi.revoked_at,
    hi.used_at
  from public.household_invites hi
  where hi.household_id = p_household_id
    and public.is_household_admin(p_household_id)
    and hi.revoked_at is null
    and hi.used_at is null
    and hi.expires_at > now()
  order by hi.created_at desc;
$$;

create or replace function public.revoke_household_invite(
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select hi.household_id
  into v_household_id
  from public.household_invites hi
  where hi.id = p_invite_id;

  if v_household_id is null then
    return;
  end if;

  if not public.is_household_admin(v_household_id) then
    raise exception 'Only household admins can revoke invites';
  end if;

  update public.household_invites hi
  set revoked_at = now()
  where hi.id = p_invite_id
    and hi.revoked_at is null
    and hi.used_at is null;
end;
$$;

create or replace function public.join_household_with_invite(
  p_invite_code text,
  p_display_name text default null
)
returns table (
  household_id uuid,
  member_id uuid,
  member_role public.household_member_role,
  household_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_invite public.household_invites;
  v_member_id uuid;
  v_display_name text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(coalesce(p_invite_code, '')), '') is null then
    raise exception 'Invite code is required';
  end if;

  select *
  into v_invite
  from public.household_invites hi
  where hi.invite_code = upper(btrim(p_invite_code))
    and hi.revoked_at is null
    and hi.used_at is null
    and hi.expires_at > now()
  limit 1;

  if v_invite.id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  select hm.id
  into v_member_id
  from public.household_members hm
  where hm.household_id = v_invite.household_id
    and hm.user_id = v_user_id
  limit 1;

  if v_member_id is null then
    v_display_name := nullif(btrim(p_display_name), '');

    insert into public.household_members (
      household_id,
      user_id,
      role,
      display_name
    )
    values (
      v_invite.household_id,
      v_user_id,
      v_invite.role,
      v_display_name
    )
    returning id into v_member_id;
  end if;

  update public.household_invites hi
  set used_by_user_id = v_user_id,
      used_at = now()
  where hi.id = v_invite.id;

  household_id := v_invite.household_id;
  member_id := v_member_id;
  member_role := v_invite.role;
  select h.name into household_name from public.households h where h.id = v_invite.household_id;
  return next;
end;
$$;

grant execute on function public.create_household_invite(uuid, public.household_member_role, integer) to authenticated;
grant execute on function public.list_household_invites(uuid) to authenticated;
grant execute on function public.revoke_household_invite(uuid) to authenticated;
grant execute on function public.join_household_with_invite(text, text) to authenticated;

revoke execute on function public.create_household_invite(uuid, public.household_member_role, integer) from public;
revoke execute on function public.list_household_invites(uuid) from public;
revoke execute on function public.revoke_household_invite(uuid) from public;
revoke execute on function public.join_household_with_invite(text, text) from public;

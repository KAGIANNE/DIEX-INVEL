-- DIEX INVEL — autenticación por nombre de usuario.
-- Supabase Auth conserva un correo técnico interno; nunca se muestra en la app.

alter table public.user_profiles
  add column if not exists username text;

alter table public.user_invitations
  add column if not exists username text;

alter table public.user_invitations
  alter column email drop not null;

create unique index if not exists user_profiles_username_unique_idx
  on public.user_profiles (lower(username))
  where username is not null;

create unique index if not exists user_invitations_org_username_unique_idx
  on public.user_invitations (organization_id, lower(username))
  where username is not null;

alter table public.user_profiles
  drop constraint if exists user_profiles_username_format;

alter table public.user_profiles
  add constraint user_profiles_username_format
  check (username is null or username ~ '^[A-Za-z0-9]{3,15}$');

alter table public.user_invitations
  drop constraint if exists user_invitations_username_format;

alter table public.user_invitations
  add constraint user_invitations_username_format
  check (username is null or username ~ '^[A-Za-z0-9]{3,15}$');

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation record;
  new_username text;
begin
  new_username := lower(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  ));

  insert into public.user_profiles (id, email, username, full_name, phone)
  values (
    new.id,
    lower(new.email),
    new_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(excluded.username, public.user_profiles.username),
        full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
        phone = excluded.phone;

  select *
  into invitation
  from public.user_invitations
  where active
    and (
      lower(username) = new_username
      or (username is null and lower(coalesce(email, '')) = lower(new.email))
    )
  order by created_at
  limit 1;

  if invitation.id is not null then
    insert into public.organization_members (
      organization_id, user_id, role, branch_id, warehouse_id, active
    )
    values (
      invitation.organization_id,
      new.id,
      invitation.role,
      invitation.branch_id,
      invitation.warehouse_id,
      true
    )
    on conflict (organization_id, user_id) do update
      set role = excluded.role,
          branch_id = excluded.branch_id,
          warehouse_id = excluded.warehouse_id,
          active = true,
          updated_at = now();

    update public.user_invitations
    set active = false,
        accepted_user_id = new.id,
        accepted_at = now(),
        updated_at = now()
    where id = invitation.id;
  else
    insert into public.organization_members (organization_id, user_id, role)
    select organization.id, new.id, 'admin'
    from public.organizations organization
    where organization.active
      and not exists (
        select 1
        from public.organization_members member
        where member.organization_id = organization.id
          and member.active
      )
    order by organization.created_at
    limit 1
    on conflict (organization_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

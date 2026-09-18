-- DIEX INVEL — administración de usuarios, locales y almacenes.
-- Los usuarios nuevos se registran como invitaciones y se vinculan al
-- momento de crear su cuenta de Auth; nunca se expone service_role al frontend.

alter table public.user_profiles
  add column if not exists email text;

alter table public.organization_members
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete set null;

create index if not exists organization_members_org_active_idx
  on public.organization_members (organization_id, active);

create index if not exists user_profiles_email_idx
  on public.user_profiles (lower(email));

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'sales' check (role in ('admin', 'supervisor', 'sales', 'cashier', 'mobile_sales')),
  branch_id uuid references public.branches(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create trigger user_invitations_set_updated_at
  before update on public.user_invitations
  for each row execute function private.set_updated_at();

update public.user_profiles profile
set email = lower(auth_user.email)
from auth.users auth_user
where auth_user.id = profile.id
  and (profile.email is null or profile.email <> lower(auth_user.email));

create or replace function private.is_org_admin(target_organization_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role = 'admin'
  );
$$;

revoke all on function private.is_org_admin(uuid) from public;
grant execute on function private.is_org_admin(uuid) to authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation record;
begin
  insert into public.user_profiles (id, email, full_name, phone)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
        phone = coalesce(excluded.phone, public.user_profiles.phone);

  select *
  into invitation
  from public.user_invitations
  where lower(email) = lower(new.email)
    and active
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
  end if;

  return new;
end;
$$;

grant select, insert, update, delete on public.organization_members to authenticated;
grant update on public.organizations to authenticated;
grant select, insert, update, delete on public.user_invitations to authenticated;

create policy organizations_admin_update on public.organizations
  for update to authenticated
  using (private.is_org_admin(id))
  with check (private.is_org_admin(id));

create policy organization_members_org_admin_select on public.organization_members
  for select to authenticated
  using (private.is_org_admin(organization_id));

create policy organization_members_admin_insert on public.organization_members
  for insert to authenticated
  with check (private.is_org_admin(organization_id));

create policy organization_members_admin_update on public.organization_members
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy organization_members_admin_delete on public.organization_members
  for delete to authenticated
  using (private.is_org_admin(organization_id));

create policy user_profiles_org_admin_select on public.user_profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members member
      where member.user_id = user_profiles.id
        and private.is_org_admin(member.organization_id)
    )
  );

create policy user_profiles_org_admin_update on public.user_profiles
  for update to authenticated
  using (
    exists (
      select 1
      from public.organization_members member
      where member.user_id = user_profiles.id
        and private.is_org_admin(member.organization_id)
    )
  )
  with check (id = (select auth.uid()) or exists (
    select 1
    from public.organization_members member
    where member.user_id = user_profiles.id
      and private.is_org_admin(member.organization_id)
  ));

create policy user_invitations_admin_select on public.user_invitations
  for select to authenticated
  using (private.is_org_admin(organization_id));

create policy user_invitations_admin_insert on public.user_invitations
  for insert to authenticated
  with check (private.is_org_admin(organization_id));

create policy user_invitations_admin_update on public.user_invitations
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy user_invitations_admin_delete on public.user_invitations
  for delete to authenticated
  using (private.is_org_admin(organization_id));

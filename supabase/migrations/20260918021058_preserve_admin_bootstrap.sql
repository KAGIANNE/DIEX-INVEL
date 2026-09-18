-- Mantiene el alta inicial del primer administrador y vincula las
-- invitaciones pendientes cuando el correo crea su cuenta.
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

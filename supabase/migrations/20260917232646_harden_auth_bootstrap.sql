create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  )
  on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;

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

  return new;
end;
$$;

revoke all on function public.bootstrap_current_user(uuid) from public;
drop function public.bootstrap_current_user(uuid);

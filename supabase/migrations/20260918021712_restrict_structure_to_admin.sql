-- La estructura de la empresa se administra únicamente desde el rol admin.
drop policy if exists branches_member_insert on public.branches;
drop policy if exists branches_manager_update on public.branches;
drop policy if exists branches_manager_delete on public.branches;
drop policy if exists warehouses_member_insert on public.warehouses;
drop policy if exists warehouses_manager_update on public.warehouses;
drop policy if exists warehouses_manager_delete on public.warehouses;

create policy branches_admin_insert on public.branches
  for insert to authenticated
  with check (private.is_org_admin(organization_id));

create policy branches_admin_update on public.branches
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy branches_admin_delete on public.branches
  for delete to authenticated
  using (private.is_org_admin(organization_id));

create policy warehouses_admin_insert on public.warehouses
  for insert to authenticated
  with check (private.is_org_admin(organization_id));

create policy warehouses_admin_update on public.warehouses
  for update to authenticated
  using (private.is_org_admin(organization_id))
  with check (private.is_org_admin(organization_id));

create policy warehouses_admin_delete on public.warehouses
  for delete to authenticated
  using (private.is_org_admin(organization_id));

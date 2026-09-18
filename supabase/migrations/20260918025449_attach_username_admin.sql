-- Vincula la cuenta de usuario creada desde la nueva pantalla de acceso.
-- La cuenta histórica por correo ya ocupaba el arranque de la organización.

insert into public.organization_members (organization_id, user_id, role, active)
select organization.id, auth_user.id, 'admin', true
from public.organizations organization
join auth.users auth_user
  on lower(auth_user.email) = 'admin@auth.diex.local'
join public.user_profiles profile
  on profile.id = auth_user.id
where organization.active
  and profile.username = 'admin'
  and not exists (
    select 1
    from public.organization_members member
    where member.organization_id = organization.id
      and member.user_id = auth_user.id
  );

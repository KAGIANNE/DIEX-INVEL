# 004 — Administración de usuarios y estructura operativa

**Estado:** implementada en el prototipo.

La pantalla Administración centraliza la empresa, los usuarios, las invitaciones, los locales y los almacenes. La autorización real está en Supabase RLS; ocultar botones en el frontend no es la única barrera.

## Usuarios

Los usuarios existentes se relacionan con organization_members y user_profiles. El administrador puede crear la cuenta con una contraseña inicial, editar nombre, teléfono, documento, rol, local y almacén; puede inactivar/reactivar el acceso o eliminar permanentemente la cuenta. El propio administrador no puede eliminarse ni inactivarse desde su sesión y el sistema evita eliminar al último administrador activo.

Las Edge Functions `create-user-by-admin` y `delete-user-by-admin` validan el administrador y gestionan Auth en servidor. La contraseña inicial nunca se guarda en `user_profiles` ni `user_invitations`; solo se entrega a Supabase Auth. El frontend conserva el nombre de usuario; el correo técnico de Auth solo sirve para la compatibilidad interna. No se usa `service_role` en el navegador.

## Locales y almacenes

branches representa los locales o sedes. warehouses representa tiendas, depósitos, vehículos u otros almacenes vinculados a una sede. Ambos permiten crear, editar, inactivar, reactivar y eliminar; PostgreSQL impide eliminar una sede que todavía tiene almacenes relacionados.

## Seguridad

Las operaciones de administración requieren el rol admin. Las migraciones de esta funcionalidad agregan las columnas de alcance y nombre de usuario, la tabla de invitaciones, políticas RLS, el alta segura de invitaciones, el cierre de una función SECURITY DEFINER antigua y la restricción de locales/almacenes al administrador. La eliminación de locales o almacenes es permanente y respeta las restricciones de historial y relaciones.

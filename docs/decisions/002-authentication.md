# 002 — Autenticación y permisos

**Estado:** implementada parcialmente en el prototipo.

El sistema tendrá usuarios individuales, nunca cuentas compartidas. Cada usuario pertenecerá a una organización y podrá limitarse a una sede. Los roles iniciales son `admin`, `supervisor`, `sales`, `cashier` y `mobile_sales`.

En el servidor local, la API validará usuario, rol, sede y operación antes de escribir en PostgreSQL. Las pantallas no serán la única barrera de seguridad. En una futura sincronización con Supabase, `user_profiles` se vinculará con `auth.users`, `organization_members` definirá el alcance y RLS aislará cada organización.

Las contraseñas, tokens y claves de servicio no se guardarán en el repositorio. Los registros de auditoría conservarán usuario, fecha, acción y cambios relevantes. Las claves publicables podrán estar en el cliente; las claves administrativas y de servicio permanecerán únicamente en el servidor.

En la interfaz está implementado un auth gate con Supabase Auth: la pantalla se mantiene bloqueada mientras se comprueba la sesión, y cada ruta de módulo requiere una sesión y un contexto de organización activos. El cliente solo usa la clave publishable; nunca expone service_role ni claves secretas.

La administración usa invitaciones por correo para cuentas nuevas. El administrador crea la invitación con rol, local y almacén; el trigger de Auth vincula la cuenta al registrarse. Los miembros existentes se pueden actualizar o inactivar mediante políticas RLS exclusivas para admin. “Eliminar” elimina el acceso a la organización, no borra el historial operativo ni intenta borrar el usuario global de Auth.

Antes de producción se deben definir recuperación de contraseña, bloqueo por intentos, permisos exactos por módulo y política de copias de seguridad.

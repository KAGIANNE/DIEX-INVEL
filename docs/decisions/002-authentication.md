# 002 — Autenticación y permisos

**Estado:** propuesta.

El sistema tendrá usuarios individuales, nunca cuentas compartidas. Cada usuario pertenecerá a una organización y podrá limitarse a una sede. Los roles iniciales son `admin`, `supervisor`, `sales`, `cashier` y `mobile_sales`.

En el servidor local, la API validará usuario, rol, sede y operación antes de escribir en PostgreSQL. Las pantallas no serán la única barrera de seguridad. En una futura sincronización con Supabase, `user_profiles` se vinculará con `auth.users`, `organization_members` definirá el alcance y RLS aislará cada organización.

Las contraseñas, tokens y claves de servicio no se guardarán en el repositorio. Los registros de auditoría conservarán usuario, fecha, acción y cambios relevantes. Las claves publicables podrán estar en el cliente; las claves administrativas y de servicio permanecerán únicamente en el servidor.

Antes de producción se deben definir recuperación de contraseña, bloqueo por intentos, cierre de sesión, permisos exactos por módulo y política de copias de seguridad.

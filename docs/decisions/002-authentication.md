# 002 — Autenticación y permisos

**Estado:** implementada parcialmente en el prototipo.

El sistema tendrá usuarios individuales, nunca cuentas compartidas. Cada usuario pertenecerá a una organización y podrá limitarse a una sede. Los roles iniciales son `admin`, `supervisor`, `sales`, `cashier` y `mobile_sales`.

En el servidor local, la API validará usuario, rol, sede y operación antes de escribir en PostgreSQL. Las pantallas no serán la única barrera de seguridad. En una futura sincronización con Supabase, `user_profiles` se vinculará con `auth.users`, `organization_members` definirá el alcance y RLS aislará cada organización.

Las contraseñas, tokens y claves de servicio no se guardarán en el repositorio. Los registros de auditoría conservarán usuario, fecha, acción y cambios relevantes. Las claves publicables podrán estar en el cliente; las claves administrativas y de servicio permanecerán únicamente en el servidor.

En la interfaz está implementado un auth gate con Supabase Auth: la pantalla se mantiene bloqueada mientras se comprueba la sesión, y cada ruta de módulo requiere una sesión y un contexto de organización activos. El cliente solo usa la clave publishable; nunca expone service_role ni claves secretas.

La aplicación usa nombres de usuario alfanuméricos de 3 a 15 caracteres. Supabase Auth conserva un correo técnico interno (`<usuario>@auth.diex.local`) para su API de contraseña, pero nunca se solicita ni se muestra un correo real. Las contraseñas aceptadas tienen de 6 a 10 caracteres y deben incluir letras y números; la interfaz valida el máximo de 10 y Supabase exige la combinación de letras y números. Las Edge Functions protegidas permiten al administrador crear la cuenta Auth con una contraseña inicial sin exponer `service_role` al navegador. Los miembros existentes se pueden actualizar, activar o inactivar mediante RLS; la eliminación permanente pasa por una Edge Function y borra la cuenta global de Auth. No se permite eliminar al último administrador activo.

Antes de producción se deben definir recuperación de contraseña, bloqueo por intentos, permisos exactos por módulo y política de copias de seguridad.

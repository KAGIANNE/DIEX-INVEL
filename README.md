# DIEX INVEL

Base inicial del sistema de gestión comercial local-first para ventas, caja, administración e inventario.

## Abrir el prototipo

Abre [src/index.html](src/index.html) directamente en el navegador. La aplicación muestra primero una pantalla de acceso protegida por Supabase Auth; después de iniciar sesión, la operación y sus datos continúan guardándose localmente en localStorage.

La interfaz usa `src/theme.css` como capa visual de la aplicación: colores por módulo y estado, tipografía legible, controles táctiles de al menos 44 px y diseño responsive para PC, tablet y celular.

## Conexión con Supabase

La aplicación ya está configurada para el proyecto DIEX (tgibzcuqmrqpyojtvjkf.supabase.co) con una clave publishable. El acceso a todos los módulos pasa por Supabase Auth:

1. En la pantalla de acceso, crea el primer usuario con correo, contraseña y nombre. El primer usuario queda como administrador.
2. Inicia sesión para comprobar la organización y el rol; sin una sesión válida no se muestran ni se navegan los módulos.
3. En Configuración, usa Guardar copia en Supabase para respaldar los datos locales.
4. En otra PC, inicia sesión y usa Descargar copia remota solo cuando quieras reemplazar sus datos locales.

La autenticación inicial y el refresco de sesión requieren internet. Mientras la sesión siga vigente, la operación continúa con sus datos locales; la copia queda pendiente hasta volver a conectarse. El respaldo actual es un snapshot y no sustituye aún al futuro servidor local multi-PC.

## Administración

En el menú Administración, el usuario con rol administrador puede editar los datos de la empresa, crear y editar locales, crear y editar almacenes, y administrar usuarios. Los usuarios existentes se pueden editar, inactivar, reactivar o eliminar del acceso. Para un correo que todavía no tiene cuenta, DIEX crea una invitación pendiente; cuando esa persona se registra, el trigger de Supabase le asigna el rol, local y almacén definidos.

## Incluido en esta fase

- Resumen de ventas, saldos, productos y valor del inventario.
- Catálogo con precios por unidad, docena y pack.
- Stock físico y documentado.
- Compras en soles o dólares con tipo de cambio.
- Ventas, boletas, facturas, notas de pedido y cotizaciones.
- Pagos parciales, saldos y Kardex con promedio ponderado.
- Exportación CSV de catálogo y Kardex.
- Exportación real `.xlsx` con productos, ventas, compras y Kardex.
- Impresión de tickets térmicos de 80 mm desde Ventas.
- Migraciones versionadas en `supabase/migrations/` con RLS y datos iniciales.
- Pantalla de acceso protegida, rutas por hash y sesión persistente con Supabase Auth.
- Respaldo remoto autenticado desde la pantalla de configuración.
- Administración de empresa, usuarios, roles, invitaciones, locales y almacenes con RLS administrativo.
- Interfaz responsive orientada a tienda, con mayor contraste, jerarquía visual y navegación móvil.

## Comandos de verificación

- `node --check src/app.js` valida la lógica de la interfaz.
- `node --check src/supabase-client.js` valida el adaptador de conexión.
- `node --check src/excel-export.js` valida el exportador XLSX offline.
- `supabase db push --project-ref tgibzcuqmrqpyojtvjkf` aplica las migraciones pendientes desde `supabase/migrations/`.

## Estructura documental

- `AGENTS.md` y `CLAUDE.md`: guía sincronizada para colaboradores y agentes.
- `docs/architecture.md`: arquitectura objetivo y flujo de datos.
- `docs/current-state.md`: estado implementado, límites y próximos hitos.
- `docs/decisions/`: decisiones duraderas, incluida la propuesta completa de base de datos.

## Próxima fase

La base de datos, la impresión térmica y la exportación Excel ya están implementadas. La siguiente fase es extraer la lógica a una API local con PostgreSQL compartido por sede, conectar ventas/compras/caja de forma transaccional y preparar el instalador para las PCs.

Este prototipo no debe usarse todavía como sistema contable ni emisor oficial.

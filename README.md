# DIEX INVEL

Base inicial del sistema de gestión comercial local-first para ventas, caja, administración e inventario.

## Abrir el prototipo

Abre [`src/index.html`](src/index.html) directamente en el navegador. La operación local no necesita internet: los datos se guardan primero en `localStorage` del equipo.

## Conexión con Supabase

La aplicación ya está configurada para el proyecto DIEX (`tgibzcuqmrqpyojtvjkf.supabase.co`) con una clave publishable. En `Configuración`:

1. Crea el primer usuario con correo, contraseña y nombre. El primer usuario queda como administrador.
2. Inicia sesión para comprobar la organización y el rol.
3. Usa `Guardar copia en Supabase` para respaldar los datos locales.
4. En otra PC, inicia sesión y usa `Descargar copia remota` solo cuando quieras reemplazar sus datos locales.

La autenticación y el respaldo requieren internet. Si internet se corta, el modo local continúa; la copia queda pendiente hasta volver a conectarse. El respaldo actual es un snapshot y no sustituye aún al futuro servidor local multi-PC.

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
- Autenticación y respaldo remoto opcional desde la pantalla de configuración.

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

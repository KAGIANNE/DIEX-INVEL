# Estado actual

## Implementado

- Prototipo visual navegable en `src/index.html`.
- Dashboard con ventas, saldos, productos, alertas y valor de inventario.
- Catálogo de productos con familias, marcas, costos, precios y stock mínimo.
- Registro local de compras en PEN/USD, tipo de cambio y promedio ponderado.
- Registro local de boletas, facturas, notas de pedido y cotizaciones.
- Pagos parciales y cálculo de saldo pendiente.
- Stock físico/documentado y movimientos de Kardex.
- Exportación CSV de catálogo y Kardex.
- Exportación Excel `.xlsx` con hojas de productos, ventas, compras y Kardex.
- Impresión de tickets de venta en formato térmico de 80 mm desde la tabla de Ventas.
- Persistencia temporal mediante `localStorage`.
- Guía de colaboradores sincronizada mediante `.cursor/hooks/sync-agent-guides.mjs`.
- Migraciones PostgreSQL aplicadas en el proyecto DIEX de Supabase.
- RLS activo en las 46 tablas públicas y políticas por organización/rol.
- Pantalla de acceso protegida por Supabase Auth, registro del primer usuario administrador, cierre de sesión y copia remota autenticada.
- Rutas de módulos protegidas por sesión.
- El primer usuario nuevo queda asociado como administrador de DIEX mediante el trigger de Auth.
- Administración funcional de empresa, usuarios, invitaciones, locales y almacenes desde la ruta #/administration.
- Alta segura de usuarios por invitación, edición de perfil/rol/local/almacén, baja reversible, reactivación y eliminación de acceso.
- Migraciones de administración y seguridad aplicadas en Supabase: seis migraciones en total, con cuatro cambios nuevos para usuarios, invitaciones, locales, almacenes y RLS.
- Rediseño visual completo en `src/theme.css`, con mayor contraste, controles legibles, colores por módulo y adaptación responsive para PC, tablet y celular.

## Verificación realizada

- `node --check src/app.js` pasó correctamente.
- `node --check src/supabase-client.js` pasó correctamente.
- `node --check src/excel-export.js` pasó correctamente.
- Se generó un XLSX de prueba y se verificó su estructura ZIP, estilos, libro y hoja.
- Se confirmó que la estructura `docs/`, `src/` y `tests/` existe.
- Se revisó que `AGENTS.md` y `CLAUDE.md` se mantengan idénticos mediante el hook.
- Supabase confirmó 6 migraciones aplicadas, 46 tablas con RLS y la revisión de seguridad sin incidencias.
- Se validó que el tema visual se cargue después de `styles.css`, conservando la lógica existente y permitiendo ajustes visuales sin duplicar la estructura HTML.

## Limitaciones

La administración remota requiere conexión para leer o guardar en Supabase; las operaciones administrativas locales se conservan en el estado local del equipo.

No hay todavía API/servidor local compartido, instalador de Windows, sincronización transaccional multi-PC, clientes/proveedores persistentes desde la interfaz ni integración SUNAT. La impresión depende de que Windows tenga configurada la impresora; el navegador muestra el diálogo de impresión. Supabase requiere internet para iniciar sesión y guardar/descargar la copia; la operación local con `localStorage` funciona sin internet. La copia remota es un respaldo JSON y la última PC que la guarda reemplaza la anterior.

## Próximos hitos

1. Extraer la lógica de negocio a una API local con PostgreSQL compartido por sede.
2. Migrar ventas, compras, caja y Kardex a operaciones transaccionales de la API.
3. Conectar la administración y las operaciones a una API local con PostgreSQL transaccional.
4. Añadir clientes, proveedores, impresión, documentos electrónicos y acceso móvil.

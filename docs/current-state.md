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
- Persistencia temporal mediante `localStorage`.
- Guía de colaboradores sincronizada mediante `.cursor/hooks/sync-agent-guides.mjs`.
- Migraciones PostgreSQL aplicadas en el proyecto DIEX de Supabase.
- RLS activo en las 46 tablas públicas y políticas por organización/rol.
- Panel frontend para registro/inicio de sesión, cierre de sesión y copia remota autenticada.
- El primer usuario nuevo queda asociado como administrador de DIEX mediante el trigger de Auth.

## Verificación realizada

- `node --check src/app.js` pasó correctamente.
- `node --check src/supabase-client.js` pasó correctamente.
- Se confirmó que la estructura `docs/`, `src/` y `tests/` existe.
- Se revisó que `AGENTS.md` y `CLAUDE.md` se mantengan idénticos mediante el hook.
- Supabase confirmó 2 migraciones aplicadas, 46 tablas con RLS y 173 políticas.

## Limitaciones

No hay todavía API/servidor local compartido, instalador de Windows, sincronización transaccional multi-PC, clientes/proveedores persistentes desde la interfaz, impresión térmica, Excel nativo ni integración SUNAT. Supabase requiere internet para iniciar sesión y guardar/descargar la copia; la operación local con `localStorage` funciona sin internet. La copia remota es un respaldo JSON y la última PC que la guarda reemplaza la anterior.

## Próximos hitos

1. Extraer la lógica de negocio a una API local con PostgreSQL compartido por sede.
2. Migrar ventas, compras, caja y Kardex a operaciones transaccionales de la API.
3. Preparar autenticación por roles, instalador para PCs y sincronización con Supabase.
4. Añadir clientes, proveedores, impresión, documentos electrónicos y acceso móvil.

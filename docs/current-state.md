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

## Verificación realizada

- `node --check src/app.js` pasó correctamente.
- Se confirmó que la estructura `docs/`, `src/` y `tests/` existe.
- Se revisó que `AGENTS.md` y `CLAUDE.md` se mantengan idénticos mediante el hook.

## Limitaciones

No hay todavía base de datos compartida, servidor local, instalador de Windows, autenticación, permisos reales, sincronización, copias automáticas, clientes/proveedores persistentes, impresión térmica, Excel nativo ni integración SUNAT. Los productos iniciales son datos de demostración.

## Próximos hitos

1. Verificar y aprobar la propuesta de tablas de `docs/decisions/001-database.md`.
2. Crear migraciones PostgreSQL/Supabase después de la aprobación.
3. Extraer la lógica de negocio a una API y reemplazar `localStorage`.
4. Preparar el servidor local, instalador para PCs y respaldo opcional en la nube.

# DIEX INVEL

Base inicial del sistema de gestión comercial local-first para ventas, caja, administración e inventario.

## Abrir el prototipo

Abre [`src/index.html`](src/index.html) directamente en el navegador. No necesita instalación ni internet para esta fase. Los datos de demostración se guardan temporalmente en `localStorage` del navegador.

## Incluido en esta fase

- Resumen de ventas, saldos, productos y valor del inventario.
- Catálogo con precios por unidad, docena y pack.
- Stock físico y documentado.
- Compras en soles o dólares con tipo de cambio.
- Ventas, boletas, facturas, notas de pedido y cotizaciones.
- Pagos parciales, saldos y Kardex con promedio ponderado.
- Exportación CSV de catálogo y Kardex.

## Estructura documental

- `AGENTS.md` y `CLAUDE.md`: guía sincronizada para colaboradores y agentes.
- `docs/architecture.md`: arquitectura objetivo y flujo de datos.
- `docs/current-state.md`: estado implementado, límites y próximos hitos.
- `docs/decisions/`: decisiones duraderas, incluida la propuesta completa de base de datos.

## Próxima fase

Antes de crear tablas en Supabase se debe validar [`docs/decisions/001-database.md`](docs/decisions/001-database.md). Después se implementará el servidor local, PostgreSQL, usuarios/roles, copias de seguridad, clientes, proveedores, impresión, documentos electrónicos y acceso móvil.

Este prototipo no debe usarse todavía como sistema contable ni emisor oficial.

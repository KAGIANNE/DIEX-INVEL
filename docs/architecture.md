# Arquitectura

## Objetivo

DIEX INVEL será una aplicación local-first instalada en las PCs de ventas, caja y administración. Un servidor dentro de cada local alojará la API y PostgreSQL. Las estaciones se conectarán por la red del router, sin depender de internet para operar.

```text
PC servidor local (API + PostgreSQL)
  ├── PCs de ventas
  ├── PCs de caja
  ├── PC administrador
  └── celulares dentro del mismo Wi-Fi (opcional)
```

Supabase será una capa opcional para respaldo, sincronización y acceso remoto. No se expondrá PostgreSQL directamente a internet. El acceso remoto deberá pasar por una API segura, VPN o servicios gestionados.

## Implementación actual

El prototipo de `src/` es estático y se ejecuta en el navegador. `app.js` mantiene los datos operativos en `localStorage` para funcionar sin internet. `supabase-client.js` conecta Auth y `app_settings` mediante REST usando solo la clave publishable; después de iniciar sesión permite guardar o descargar una copia remota autenticada. Las migraciones normalizadas ya están aplicadas en Supabase con RLS por organización.

La interfaz también genera libros `.xlsx` offline con datos tipados y abre un ticket de 80 mm para imprimir una venta desde el navegador. La impresora térmica se configura en Windows y el navegador controla el diálogo de impresión.

Esta copia remota es un respaldo de transición. No debe considerarse todavía la fuente compartida de verdad para varias PCs, porque dos equipos pueden sobrescribir simultáneamente el mismo snapshot.

## Límites de los componentes

- La interfaz presenta productos, compras, ventas, caja básica, inventario y Kardex.
- El futuro servidor será responsable de validar permisos, reglas de stock, numeración, transacciones y auditoría.
- PostgreSQL será la fuente compartida de verdad para todas las PCs del local.
- Un mecanismo de sincronización opcional enviará cambios autorizados a Supabase cuando exista internet.
- La aplicación guarda primero localmente; la copia remota se puede guardar manualmente y se programa después de nuevas operaciones cuando hay una sesión administrativa.

## Flujo de datos

Una venta o compra se registra desde un cliente instalado, la API valida el usuario y la operación, PostgreSQL guarda el documento y una transacción de inventario, y la interfaz actualiza saldos y Kardex. Las cotizaciones no afectan stock; las notas de pedido afectan el físico; las boletas y facturas afectan físico y documentado según disponibilidad.

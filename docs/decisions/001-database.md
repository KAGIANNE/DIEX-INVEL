# 001 — Propuesta de base de datos comercial

**Estado:** aprobada e implementada en el proyecto DIEX de Supabase.

## Implementación aplicada

- `supabase/migrations/20260917225712_initial_schema.sql` crea el modelo completo, índices, triggers, semillas y políticas RLS.
- `supabase/migrations/20260917232646_harden_auth_bootstrap.sql` elimina la RPC pública de arranque y registra automáticamente al primer usuario autenticado como administrador.
- Verificación remota: 46 tablas públicas, 46 tablas con RLS, 173 políticas y 2 migraciones aplicadas.
- Se sembraron la organización DIEX INVEL, sede y almacén principal, unidades, métodos de pago y lista general de precios.
- El frontend conserva `localStorage` como fuente inmediata y usa `app_settings` para una copia remota opcional autenticada.

## Principios

PostgreSQL será la base compartida. Todas las tablas operativas tendrán `organization_id`, identificadores UUID, `created_at`, `updated_at` y claves foráneas. Las cantidades y los importes usarán `numeric`, nunca `float`. La separación de empresas se reforzará con RLS cuando se use Supabase.

## Tablas propuestas

### Organización y seguridad

- `organizations`: `id`, `legal_name`, `trade_name`, `tax_id`, `currency`, `timezone`, `active`.
- `branches`: `id`, `organization_id`, `code`, `name`, `address`, `phone`, `active`.
- `warehouses`: `id`, `branch_id`, `code`, `name`, `warehouse_type`, `active`.
- `user_profiles`: `id` (referencia al usuario autenticado), `full_name`, `document_number`, `phone`, `active`.
- `organization_members`: `organization_id`, `user_id`, `role`, `branch_id`, `active`.
- `audit_log`: `id`, `organization_id`, `user_id`, `action`, `table_name`, `record_id`, `old_data`, `new_data`, `created_at`.
- `app_settings`: `id`, `organization_id`, `key`, `value_json`, `updated_by`.

### Catálogo y precios

- `product_families`: `id`, `organization_id`, `name`, `active`.
- `brands`: `id`, `organization_id`, `name`, `active`.
- `tax_categories`: `id`, `organization_id`, `code`, `name`, `rate`, `tax_treatment` (gravada, exonerada, inafecta).
- `units`: `id`, `organization_id`, `code`, `name`, `decimal_scale`.
- `products`: `id`, `organization_id`, `sku`, `barcode`, `name`, `description`, `family_id`, `brand_id`, `base_unit_id`, `tax_category_id`, `min_stock`, `warranty_months`, `cost_method`, `active`.
- `product_presentations`: `id`, `product_id`, `name`, `unit_id`, `multiplier_to_base`, `barcode`, `active`.
- `price_lists`: `id`, `organization_id`, `name`, `currency`, `active`.
- `product_prices`: `id`, `price_list_id`, `presentation_id`, `min_quantity`, `unit_price`, `valid_from`, `valid_to`.

### Inventario y operaciones de almacén

- `stock_balances`: `id`, `organization_id`, `warehouse_id`, `product_id`, `physical_quantity`, `documented_quantity`, `average_cost`, `updated_at`.
- `inventory_movements`: `id`, `organization_id`, `warehouse_id`, `product_id`, `movement_type`, `source_type`, `source_id`, `physical_in`, `physical_out`, `documented_in`, `documented_out`, `unit_cost`, `total_cost`, `occurred_at`, `user_id`, `notes`.
- `vehicles`: `id`, `branch_id`, `plate`, `description`, `active`.
- `vehicle_stock`: `id`, `vehicle_id`, `product_id`, `quantity`, `average_cost`, `updated_at`.
- `vehicle_stock_movements`: `id`, `vehicle_id`, `product_id`, `movement_type`, `quantity`, `unit_cost`, `source_id`, `occurred_at`, `user_id`.

### Clientes, proveedores y documentos

- `customers`: `id`, `organization_id`, `document_type`, `document_number`, `name`, `address`, `phone`, `email`, `credit_limit`, `active`.
- `suppliers`: `id`, `organization_id`, `tax_id`, `name`, `address`, `phone`, `email`, `active`.
- `payment_methods`: `id`, `organization_id`, `name`, `method_type`, `active`.
- `document_series`: `id`, `branch_id`, `document_type`, `series`, `next_number`, `active`.
- `sales`: `id`, `organization_id`, `branch_id`, `warehouse_id`, `customer_id`, `seller_id`, `document_type`, `series`, `number`, `status`, `sale_date`, `currency`, `exchange_rate`, `subtotal`, `tax_total`, `total`, `payment_status`, `source_channel`, `parent_sale_id`, `notes`.
- `sale_items`: `id`, `sale_id`, `product_id`, `presentation_id`, `quantity`, `base_quantity`, `unit_price`, `tax_rate`, `tax_amount`, `line_total`, `warranty_months`, `delivered_at`.
- `sale_payments`: `id`, `sale_id`, `payment_method_id`, `amount`, `paid_at`, `reference`, `received_by`.
- `document_adjustments`: `id`, `organization_id`, `branch_id`, `source_sale_id`, `customer_id`, `adjustment_type`, `document_type`, `series`, `number`, `reason`, `adjustment_date`, `subtotal`, `tax_total`, `total`, `status`.
- `document_adjustment_items`: `id`, `adjustment_id`, `sale_item_id`, `product_id`, `quantity`, `base_quantity`, `unit_price`, `line_total`, `stock_effect`.
- `delivery_guides`: `id`, `organization_id`, `branch_id`, `customer_id`, `sale_id`, `series`, `number`, `status`, `dispatch_date`, `delivery_date`, `address`, `notes`.
- `delivery_guide_items`: `id`, `guide_id`, `product_id`, `quantity`, `base_quantity`.

### Compras, gastos y cuentas

- `purchases`: `id`, `organization_id`, `branch_id`, `warehouse_id`, `supplier_id`, `document_type`, `series`, `number`, `purchase_date`, `currency`, `exchange_rate`, `subtotal`, `tax_total`, `total`, `status`.
- `purchase_items`: `id`, `purchase_id`, `product_id`, `quantity`, `unit_cost`, `bonus_quantity`, `tax_rate`, `tax_amount`, `line_total`.
- `purchase_payments`: `id`, `purchase_id`, `payment_method_id`, `amount`, `paid_at`, `reference`.
- `expense_categories`: `id`, `organization_id`, `name`, `category_type` (transporte, gasolina, mantenimiento, otro), `active`.
- `expenses`: `id`, `organization_id`, `branch_id`, `category_id`, `supplier_id`, `description`, `expense_date`, `currency`, `exchange_rate`, `amount`, `payment_method_id`, `receipt_reference`.
- `supplier_tax_events`: `id`, `organization_id`, `supplier_id`, `purchase_id`, `event_type` (percepción, retención, otro), `percentage`, `amount`, `document_reference`, `event_date`.
- `accounts_receivable`: `id`, `organization_id`, `customer_id`, `sale_id`, `due_date`, `original_amount`, `balance`, `status`.
- `receivable_payments`: `id`, `account_id`, `payment_method_id`, `amount`, `paid_at`, `reference`.
- `accounts_payable`: `id`, `organization_id`, `supplier_id`, `purchase_id`, `due_date`, `original_amount`, `balance`, `status`.
- `payable_payments`: `id`, `account_id`, `payment_method_id`, `amount`, `paid_at`, `reference`.

### Caja y reparto móvil

- `cash_registers`: `id`, `branch_id`, `name`, `active`.
- `cash_sessions`: `id`, `cash_register_id`, `opened_by`, `opened_at`, `opening_balance`, `closed_by`, `closed_at`, `closing_balance`, `status`.
- `cash_movements`: `id`, `session_id`, `movement_type`, `source_type`, `source_id`, `payment_method_id`, `amount`, `occurred_at`, `user_id`, `notes`.
- `mobile_routes`: `id`, `branch_id`, `vehicle_id`, `seller_id`, `route_date`, `status`, `opening_cash`, `closing_cash`.
- `route_stops`: `id`, `route_id`, `customer_id`, `sale_id`, `sequence`, `status`, `delivered_at`, `notes`.

## Reglas que deben implementarse

Factura de compra: entrada física y documentada. Otros documentos de compra: entrada física. Cotización: sin movimiento. Nota de pedido: salida física. Boleta/factura de venta: salida física y documental según disponibilidad. Todo movimiento debe ser transaccional y auditable.

## Pendientes operativos

Validar con el responsable fiscal los campos de SUNAT, notas de crédito y ajustes. También falta decidir la instalación del servidor local por sede, la numeración oficial y la sincronización transaccional entre PCs. La copia JSON remota actual es respaldo; no reemplaza todavía el servidor local compartido ni resuelve conflictos simultáneos.

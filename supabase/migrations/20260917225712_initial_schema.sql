-- DIEX INVEL — migración inicial de PostgreSQL/Supabase
-- Esquema multiempresa para ventas, caja, inventario, compras y reparto.
-- Las reglas de documentos y stock se describen en docs/decisions/001-database.md.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text not null,
  tax_id text,
  currency text not null default 'PEN' check (currency in ('PEN', 'USD')),
  timezone text not null default 'America/Lima',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null,
  warehouse_type text not null default 'store' check (warehouse_type in ('store', 'backroom', 'vehicle', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  document_number text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'sales' check (role in ('admin', 'supervisor', 'sales', 'cashier', 'mobile_sales')),
  branch_id uuid references public.branches(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  value_json jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
      and member.active
  );
$$;

create or replace function private.has_org_role(target_organization_id uuid, allowed_roles text[])
returns boolean language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
      and member.active
      and member.role = any (allowed_roles)
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;

create table public.product_families (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.tax_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  rate numeric(8,4) not null default 0 check (rate between 0 and 100),
  tax_treatment text not null default 'gravada' check (tax_treatment in ('gravada', 'exonerada', 'inafecta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  decimal_scale smallint not null default 0 check (decimal_scale between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  family_id uuid references public.product_families(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  base_unit_id uuid references public.units(id) on delete restrict,
  tax_category_id uuid references public.tax_categories(id) on delete set null,
  min_stock numeric(18,6) not null default 0 check (min_stock >= 0),
  warranty_months integer not null default 0 check (warranty_months >= 0),
  cost_method text not null default 'weighted_average' check (cost_method = 'weighted_average'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (organization_id, barcode)
);

create table public.product_presentations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  unit_id uuid not null references public.units(id) on delete restrict,
  multiplier_to_base numeric(18,6) not null check (multiplier_to_base > 0),
  barcode text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name),
  unique (organization_id, barcode)
);

create table public.price_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  currency text not null default 'PEN' check (currency in ('PEN', 'USD')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  presentation_id uuid not null references public.product_presentations(id) on delete cascade,
  min_quantity numeric(18,6) not null default 1 check (min_quantity > 0),
  unit_price numeric(18,6) not null check (unit_price >= 0),
  valid_from date not null default current_date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  unique (price_list_id, presentation_id, min_quantity, valid_from)
);

create table public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  physical_quantity numeric(18,6) not null default 0,
  documented_quantity numeric(18,6) not null default 0,
  average_cost numeric(18,6) not null default 0 check (average_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase', 'sale', 'adjustment', 'transfer', 'return', 'initial_balance')),
  source_type text,
  source_id uuid,
  physical_in numeric(18,6) not null default 0 check (physical_in >= 0),
  physical_out numeric(18,6) not null default 0 check (physical_out >= 0),
  documented_in numeric(18,6) not null default 0 check (documented_in >= 0),
  documented_out numeric(18,6) not null default 0 check (documented_out >= 0),
  unit_cost numeric(18,6) not null default 0 check (unit_cost >= 0),
  total_cost numeric(18,6) not null default 0 check (total_cost >= 0),
  occurred_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  check (physical_in + physical_out + documented_in + documented_out > 0)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  plate text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, plate)
);

create table public.vehicle_stock (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(18,6) not null default 0 check (quantity >= 0),
  average_cost numeric(18,6) not null default 0 check (average_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, product_id)
);

create table public.vehicle_stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('load', 'unload', 'sale', 'adjustment', 'return')),
  quantity numeric(18,6) not null check (quantity > 0),
  unit_cost numeric(18,6) not null default 0 check (unit_cost >= 0),
  source_id uuid,
  occurred_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index branches_organization_idx on public.branches(organization_id);
create index warehouses_organization_idx on public.warehouses(organization_id);
create index products_organization_active_idx on public.products(organization_id, active);
create index products_organization_name_idx on public.products(organization_id, name);
create index product_presentations_product_idx on public.product_presentations(product_id);
create index product_prices_lookup_idx on public.product_prices(price_list_id, presentation_id, valid_from);
create index stock_balances_product_idx on public.stock_balances(organization_id, product_id);
create index inventory_movements_lookup_idx on public.inventory_movements(organization_id, product_id, occurred_at desc);


create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null default 'DNI' check (document_type in ('DNI', 'RUC', 'CE', 'none', 'other')),
  document_number text,
  name text not null,
  address text,
  phone text,
  email text,
  credit_limit numeric(18,6) not null default 0 check (credit_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_type, document_number)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tax_id text,
  name text not null,
  address text,
  phone text,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tax_id)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  method_type text not null check (method_type in ('cash', 'card', 'transfer', 'yape', 'plin', 'credit', 'other')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.document_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  document_type text not null check (document_type in ('boleta', 'factura', 'pedido', 'cotizacion', 'guia', 'nota_credito', 'nota_debito', 'otro')),
  series text not null,
  next_number bigint not null default 1 check (next_number > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, document_type, series)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  seller_id uuid references auth.users(id) on delete set null,
  document_type text not null check (document_type in ('boleta', 'factura', 'pedido', 'cotizacion', 'otro')),
  series text,
  number bigint,
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'cancelled', 'completed')),
  sale_date date not null default current_date,
  currency text not null default 'PEN' check (currency in ('PEN', 'USD')),
  exchange_rate numeric(18,6) not null default 1 check (exchange_rate > 0),
  subtotal numeric(18,6) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,6) not null default 0 check (tax_total >= 0),
  total numeric(18,6) not null default 0 check (total >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'partial', 'paid', 'not_applicable')),
  source_channel text not null default 'counter' check (source_channel in ('counter', 'mobile', 'web', 'phone', 'other')),
  parent_sale_id uuid references public.sales(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, document_type, series, number)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  presentation_id uuid references public.product_presentations(id) on delete set null,
  quantity numeric(18,6) not null check (quantity > 0),
  base_quantity numeric(18,6) not null check (base_quantity > 0),
  unit_price numeric(18,6) not null check (unit_price >= 0),
  tax_rate numeric(8,4) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(18,6) not null default 0 check (tax_amount >= 0),
  line_total numeric(18,6) not null default 0 check (line_total >= 0),
  warranty_months integer not null default 0 check (warranty_months >= 0),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  amount numeric(18,6) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  reference text,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.document_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  source_sale_id uuid references public.sales(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  adjustment_type text not null check (adjustment_type in ('credit_note', 'debit_note', 'return', 'void')),
  document_type text not null default 'nota_credito',
  series text,
  number bigint,
  reason text not null,
  adjustment_date date not null default current_date,
  subtotal numeric(18,6) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,6) not null default 0 check (tax_total >= 0),
  total numeric(18,6) not null default 0 check (total >= 0),
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  adjustment_id uuid not null references public.document_adjustments(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity > 0),
  base_quantity numeric(18,6) not null check (base_quantity > 0),
  unit_price numeric(18,6) not null check (unit_price >= 0),
  line_total numeric(18,6) not null default 0 check (line_total >= 0),
  stock_effect text not null default 'in' check (stock_effect in ('in', 'out', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  series text,
  number bigint,
  status text not null default 'pending' check (status in ('pending', 'dispatched', 'delivered', 'cancelled')),
  dispatch_date date,
  delivery_date date,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, series, number)
);

create table public.delivery_guide_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guide_id uuid not null references public.delivery_guides(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity > 0),
  base_quantity numeric(18,6) not null check (base_quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  document_type text not null check (document_type in ('factura', 'boleta', 'pedido', 'otro')),
  series text,
  number bigint,
  purchase_date date not null default current_date,
  currency text not null default 'PEN' check (currency in ('PEN', 'USD')),
  exchange_rate numeric(18,6) not null default 1 check (exchange_rate > 0),
  subtotal numeric(18,6) not null default 0 check (subtotal >= 0),
  tax_total numeric(18,6) not null default 0 check (tax_total >= 0),
  total numeric(18,6) not null default 0 check (total >= 0),
  status text not null default 'confirmed' check (status in ('draft', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_type, series, number)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity > 0),
  unit_cost numeric(18,6) not null check (unit_cost >= 0),
  bonus_quantity numeric(18,6) not null default 0 check (bonus_quantity >= 0),
  tax_rate numeric(8,4) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(18,6) not null default 0 check (tax_amount >= 0),
  line_total numeric(18,6) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  amount numeric(18,6) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  reference text,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category_type text not null default 'otro' check (category_type in ('transporte', 'gasolina', 'mantenimiento', 'otro')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  category_id uuid references public.expense_categories(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  description text not null,
  expense_date date not null default current_date,
  currency text not null default 'PEN' check (currency in ('PEN', 'USD')),
  exchange_rate numeric(18,6) not null default 1 check (exchange_rate > 0),
  amount numeric(18,6) not null check (amount >= 0),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  receipt_reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supplier_tax_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  event_type text not null check (event_type in ('percepcion', 'retencion', 'otro')),
  percentage numeric(8,4) not null default 0 check (percentage between 0 and 100),
  amount numeric(18,6) not null default 0 check (amount >= 0),
  document_reference text,
  event_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  due_date date not null,
  original_amount numeric(18,6) not null check (original_amount >= 0),
  balance numeric(18,6) not null check (balance >= 0),
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sale_id)
);

create table public.receivable_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts_receivable(id) on delete cascade,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  amount numeric(18,6) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  reference text,
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_id uuid not null references public.purchases(id) on delete restrict,
  due_date date not null,
  original_amount numeric(18,6) not null check (original_amount >= 0),
  balance numeric(18,6) not null check (balance >= 0),
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_id)
);

create table public.payable_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.accounts_payable(id) on delete cascade,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  amount numeric(18,6) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  reference text,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index customers_lookup_idx on public.customers(organization_id, name);
create index suppliers_lookup_idx on public.suppliers(organization_id, name);


create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_balance numeric(18,6) not null default 0 check (opening_balance >= 0),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closing_balance numeric(18,6) check (closing_balance is null or closing_balance >= 0),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null) or status <> 'open')
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  movement_type text not null check (movement_type in ('sale', 'purchase', 'expense', 'income', 'withdrawal', 'deposit', 'adjustment')),
  source_type text,
  source_id uuid,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  amount numeric(18,6) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.mobile_routes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  seller_id uuid references auth.users(id) on delete set null,
  route_date date not null default current_date,
  status text not null default 'planned' check (status in ('planned', 'open', 'closed', 'cancelled')),
  opening_cash numeric(18,6) not null default 0 check (opening_cash >= 0),
  closing_cash numeric(18,6) check (closing_cash is null or closing_cash >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  route_id uuid not null references public.mobile_routes(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  sequence integer not null check (sequence > 0),
  status text not null default 'pending' check (status in ('pending', 'visited', 'delivered', 'failed', 'cancelled')),
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, sequence)
);

create index sales_lookup_idx on public.sales(organization_id, sale_date desc, status);
create index sale_items_sale_idx on public.sale_items(sale_id);
create index purchases_lookup_idx on public.purchases(organization_id, purchase_date desc, status);
create index purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index audit_log_lookup_idx on public.audit_log(organization_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'branches', 'warehouses', 'user_profiles', 'organization_members', 'app_settings',
    'product_families', 'brands', 'tax_categories', 'units', 'products', 'product_presentations',
    'price_lists', 'product_prices', 'stock_balances', 'vehicles', 'vehicle_stock', 'customers',
    'suppliers', 'payment_methods', 'document_series', 'sales', 'sale_items', 'sale_payments',
    'document_adjustments', 'document_adjustment_items', 'delivery_guides', 'delivery_guide_items',
    'purchases', 'purchase_items', 'purchase_payments', 'expense_categories', 'expenses',
    'supplier_tax_events', 'accounts_receivable', 'receivable_payments', 'accounts_payable',
    'payable_payments', 'cash_registers', 'cash_sessions', 'mobile_routes', 'route_stops'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', 'set_updated_at_' || table_name, table_name);
  end loop;
end;
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_json jsonb;
  new_json jsonb;
  selected_json jsonb;
  organization_id_value uuid;
  record_id_value uuid;
begin
  old_json := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_json := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  selected_json := coalesce(new_json, old_json);
  organization_id_value := nullif(selected_json ->> 'organization_id', '')::uuid;
  record_id_value := nullif(selected_json ->> 'id', '')::uuid;

  insert into public.audit_log (organization_id, user_id, action, table_name, record_id, old_data, new_data)
  values (organization_id_value, (select auth.uid()), tg_op, tg_table_name, record_id_value, old_json, new_json);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'product_prices', 'stock_balances', 'inventory_movements', 'sales', 'sale_items',
    'sale_payments', 'purchases', 'purchase_items', 'purchase_payments', 'expenses',
    'document_adjustments', 'delivery_guides', 'cash_sessions', 'cash_movements'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()', 'audit_' || table_name, table_name);
  end loop;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  )
  on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.bootstrap_current_user(target_organization_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  selected_organization uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select id into selected_organization
  from public.organizations
  where id = coalesce(target_organization_id, id)
    and active
  order by created_at
  limit 1;

  if selected_organization is null then
    raise exception 'organization_not_found';
  end if;

  if exists (
    select 1 from public.organization_members
    where organization_id = selected_organization and user_id = current_user_id and active
  ) then
    return selected_organization;
  end if;

  if exists (
    select 1 from public.organization_members
    where organization_id = selected_organization and active
  ) then
    raise exception 'organization_already_initialized';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (selected_organization, current_user_id, 'admin');

  return selected_organization;
end;
$$;

revoke all on function public.bootstrap_current_user(uuid) from public;
grant execute on function public.bootstrap_current_user(uuid) to authenticated;

insert into public.organizations (id, legal_name, trade_name, currency, timezone)
values ('00000000-0000-0000-0000-000000000001', 'DIEX INVEL', 'DIEX INVEL', 'PEN', 'America/Lima')
on conflict (id) do nothing;

insert into public.branches (id, organization_id, code, name)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'PRINCIPAL', 'Local principal')
on conflict (id) do nothing;

insert into public.warehouses (id, organization_id, branch_id, code, name, warehouse_type)
values ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'PRINCIPAL', 'Almacén principal', 'store')
on conflict (id) do nothing;

insert into public.payment_methods (organization_id, name, method_type)
values
  ('00000000-0000-0000-0000-000000000001', 'Efectivo', 'cash'),
  ('00000000-0000-0000-0000-000000000001', 'Tarjeta', 'card'),
  ('00000000-0000-0000-0000-000000000001', 'Transferencia', 'transfer'),
  ('00000000-0000-0000-0000-000000000001', 'Crédito', 'credit')
on conflict (organization_id, name) do nothing;

insert into public.units (organization_id, code, name, decimal_scale)
values
  ('00000000-0000-0000-0000-000000000001', 'UN', 'Unidad', 0),
  ('00000000-0000-0000-0000-000000000001', 'KG', 'Kilogramo', 3),
  ('00000000-0000-0000-0000-000000000001', 'LT', 'Litro', 3)
on conflict (organization_id, code) do nothing;

insert into public.price_lists (organization_id, name, currency)
values ('00000000-0000-0000-0000-000000000001', 'Lista general', 'PEN')
on conflict (organization_id, name) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches', 'warehouses', 'app_settings', 'product_families', 'brands',
    'tax_categories', 'units', 'products', 'product_presentations', 'price_lists', 'product_prices',
    'stock_balances', 'inventory_movements', 'vehicles', 'vehicle_stock', 'vehicle_stock_movements',
    'customers', 'suppliers', 'payment_methods', 'document_series', 'sales', 'sale_items',
    'sale_payments', 'document_adjustments', 'document_adjustment_items', 'delivery_guides',
    'delivery_guide_items', 'purchases', 'purchase_items', 'purchase_payments', 'expense_categories',
    'expenses', 'supplier_tax_events', 'accounts_receivable', 'receivable_payments', 'accounts_payable',
    'payable_payments', 'cash_registers', 'cash_sessions', 'cash_movements', 'mobile_routes', 'route_stops'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;

  execute 'alter table public.user_profiles enable row level security';
  execute 'grant select, insert, update on public.user_profiles to authenticated';
  execute 'alter table public.organization_members enable row level security';
  execute 'grant select on public.organization_members to authenticated';
  execute 'alter table public.audit_log enable row level security';
  execute 'grant select on public.audit_log to authenticated';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches', 'warehouses', 'app_settings', 'product_families', 'brands',
    'tax_categories', 'units', 'products', 'product_presentations', 'price_lists', 'product_prices',
    'stock_balances', 'inventory_movements', 'vehicles', 'vehicle_stock', 'vehicle_stock_movements',
    'customers', 'suppliers', 'payment_methods', 'document_series', 'sales', 'sale_items',
    'sale_payments', 'document_adjustments', 'document_adjustment_items', 'delivery_guides',
    'delivery_guide_items', 'purchases', 'purchase_items', 'purchase_payments', 'expense_categories',
    'expenses', 'supplier_tax_events', 'accounts_receivable', 'receivable_payments', 'accounts_payable',
    'payable_payments', 'cash_registers', 'cash_sessions', 'cash_movements', 'mobile_routes', 'route_stops'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_org_member(organization_id))', table_name || '_member_select', table_name);
  end loop;
end;
$$;

create policy user_profiles_self_select on public.user_profiles
  for select to authenticated using (id = (select auth.uid()));
create policy user_profiles_self_update on public.user_profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy organizations_member_select on public.organizations
  for select to authenticated using (private.is_org_member(id));
create policy organization_members_self_select on public.organization_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy audit_log_member_select on public.audit_log
  for select to authenticated using (private.is_org_member(organization_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'branches', 'warehouses', 'app_settings', 'product_families', 'brands',
    'tax_categories', 'units', 'products', 'product_presentations', 'price_lists', 'product_prices',
    'stock_balances', 'inventory_movements', 'vehicles', 'vehicle_stock', 'vehicle_stock_movements',
    'customers', 'suppliers', 'payment_methods', 'document_series', 'sales', 'sale_items',
    'sale_payments', 'document_adjustments', 'document_adjustment_items', 'delivery_guides',
    'delivery_guide_items', 'purchases', 'purchase_items', 'purchase_payments', 'expense_categories',
    'expenses', 'supplier_tax_events', 'accounts_receivable', 'receivable_payments', 'accounts_payable',
    'payable_payments', 'cash_registers', 'cash_sessions', 'cash_movements', 'mobile_routes', 'route_stops'
  ] loop
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_org_role(organization_id, array[''admin'', ''supervisor'', ''sales'', ''cashier'', ''mobile_sales'']))', table_name || '_member_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (private.has_org_role(organization_id, array[''admin'', ''supervisor''])) with check (private.has_org_role(organization_id, array[''admin'', ''supervisor'']))', table_name || '_manager_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_org_role(organization_id, array[''admin'', ''supervisor'']))', table_name || '_manager_delete', table_name);
  end loop;
end;
$$;

revoke insert, update, delete on public.organization_members from authenticated;
revoke insert, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.organizations from authenticated;

grant usage on schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

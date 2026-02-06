-- Crear tabla de Cuentas (Fondos)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'debit', 'credit', 'cash', 'transfer'
    current_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar cuentas por defecto
INSERT INTO accounts (name, type, current_balance) VALUES
('Banco Estado (Cuenta Rut)', 'debit', 0),
('Santander (Empresa)', 'debit', 0),
('Caja Chica (Efectivo)', 'cash', 0),
('Tarjeta de Crédito', 'credit', 0);

-- Crear tabla de Cotizaciones
CREATE TABLE IF NOT EXISTS quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date DATE DEFAULT CURRENT_DATE,
    client_id UUID REFERENCES clients(id),
    name TEXT, -- Nombre descriptivo de la cotización
    quantity NUMERIC DEFAULT 1,
    utility_percentage NUMERIC DEFAULT 80, -- Porcentaje de utilidad buscado
    
    -- Valores Totales
    total_net_cost NUMERIC DEFAULT 0, -- Costo neto interno
    total_price_net NUMERIC DEFAULT 0, -- Precio venta neto
    total_iva NUMERIC DEFAULT 0, -- IVA venta
    total_price_gross NUMERIC DEFAULT 0, -- Total venta
    
    status TEXT DEFAULT 'draft' -- 'draft', 'approved', 'rejected', 'invoiced'
);

-- Crear tabla de Ítems de Cotización
CREATE TABLE IF NOT EXISTS quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'material', 'labor', 'service', 'other'
    date DATE DEFAULT CURRENT_DATE,
    
    -- Referencia opcional a insumo existente
    mp_code TEXT, 
    
    description TEXT NOT NULL,
    unit_value_net NUMERIC DEFAULT 0, -- Costo unitario neto
    quantity NUMERIC DEFAULT 1,
    document_type TEXT DEFAULT 'factura', -- 'factura', 'boleta' (si es boleta, el costo aumenta 19% interno)
    
    -- Cálculos de la línea
    subtotal_cost NUMERIC DEFAULT 0 -- Costo total de la línea (unit * qty * (1.19 si es boleta))
);

-- Actualizar tabla de Compras
ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id),
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'factura';

-- Actualizar tabla de Ventas
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id),
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'boleta'; -- Por defecto ventas son boleta a menos que se pida factura

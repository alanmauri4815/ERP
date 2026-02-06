-- ============================================
-- Migración: Ventas Directas Mejoradas
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Tabla de Máquinas de Pago (Transbank, Tenpo, etc.)
CREATE TABLE IF NOT EXISTS payment_machines (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT,
    commission_percent NUMERIC DEFAULT 0,
    account_id BIGINT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Tabla de Asientos Contables
CREATE TABLE IF NOT EXISTS asientos_contables (
    id BIGSERIAL PRIMARY KEY,
    date DATE DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    account_origin_id BIGINT,
    account_destination_id BIGINT,
    amount_gross NUMERIC DEFAULT 0,
    amount_iva NUMERIC DEFAULT 0,
    amount_commission NUMERIC DEFAULT 0,
    amount_net NUMERIC DEFAULT 0,
    reference_type TEXT,
    reference_ids TEXT,
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Agregar columnas a ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS is_iva_exempt BOOLEAN DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS machine_id BIGINT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS transferred BOOLEAN DEFAULT false;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS transferred_date DATE;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS transferred_to_account_id BIGINT;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS transfer_amount NUMERIC DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS event_name TEXT;

-- Comentario: Script seguro para ejecutar múltiples veces

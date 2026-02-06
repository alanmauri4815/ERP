-- ============================================
-- Migración: Agregar campos de gestión de fondos
-- VERSIÓN CORREGIDA - Compatible con IDs bigint
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Primero verificar el tipo de ID en accounts
-- Si la tabla accounts ya existe con bigint, usamos bigint

-- Agregar columnas a tabla de compras (sin foreign key por ahora)
ALTER TABLE compras ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'transfer';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS account_id BIGINT;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'factura';

-- Agregar columnas a tabla de ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'transfer';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS account_id BIGINT;

-- Verificar/crear tabla quotations si no existe
CREATE TABLE IF NOT EXISTS quotations (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT,
    name TEXT,
    quantity INTEGER DEFAULT 1,
    utility_percentage NUMERIC DEFAULT 80,
    total_net_cost NUMERIC DEFAULT 0,
    total_price_net NUMERIC DEFAULT 0,
    total_iva NUMERIC DEFAULT 0,
    total_price_gross NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'draft',
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Verificar/crear tabla quotation_items si no existe
CREATE TABLE IF NOT EXISTS quotation_items (
    id BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT,
    type TEXT DEFAULT 'material',
    description TEXT,
    document_type TEXT DEFAULT 'factura',
    unit_value_net NUMERIC DEFAULT 0,
    quantity INTEGER DEFAULT 1,
    subtotal_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Comentario: Este script es seguro de ejecutar múltiples veces

-- ============================================
-- Migración: Configurar Tablas Maestras (Clientes y Proveedores) v2
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Configurar tabla de CLIENTES (clientela)
CREATE TABLE IF NOT EXISTS clientela (
    id BIGSERIAL PRIMARY KEY,
    rut TEXT,
    name TEXT NOT NULL,
    address TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Asegurar columnas si ya existe
ALTER TABLE clientela ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE clientela ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE clientela ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clientela ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clientela ADD COLUMN IF NOT EXISTS notes TEXT;

-- Configurar tabla de PROVEEDORES (proveedores)
CREATE TABLE IF NOT EXISTS proveedores (
    id BIGSERIAL PRIMARY KEY,
    rut TEXT,
    name TEXT NOT NULL,
    address TEXT,
    contact TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Asegurar columnas si ya existe
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS rut TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS contact TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS notes TEXT;

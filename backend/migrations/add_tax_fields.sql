-- Migration Script: Add IVA and Total fields to Products and Raw Materials
-- Date: 2026-02-03
-- Purpose: Support tax accounting for future compliance

-- Step 1: Add columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS iva DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2) DEFAULT 0;

-- Step 2: Add columns to raw_materials table
ALTER TABLE raw_materials
ADD COLUMN IF NOT EXISTS iva DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2) DEFAULT 0;

-- Step 3: Update existing products with calculated values (IVA = 19%)
UPDATE products 
SET iva = ROUND(price_sale * 0.19, 2),
    total = ROUND(price_sale * 1.19, 2)
WHERE price_sale IS NOT NULL AND (iva IS NULL OR iva = 0);

-- Step 4: Update existing raw materials with calculated values (IVA = 19%)
UPDATE raw_materials
SET iva = ROUND(cost_net * 0.19, 2),
    total = ROUND(cost_net * 1.19, 2)
WHERE cost_net IS NOT NULL AND (iva IS NULL OR iva = 0);

-- Verification queries
SELECT 'Products with IVA' as table_name, COUNT(*) as count FROM products WHERE iva > 0
UNION ALL
SELECT 'Raw Materials with IVA', COUNT(*) FROM raw_materials WHERE iva > 0;

# Guía: Aplicar Migración de Campos Tributarios

## Paso 1: Migración en tu Supabase Principal

1. Ve a tu proyecto Supabase: https://supabase.com/dashboard
2. Abre el proyecto principal (el que tiene tu ERP actual)
3. Click en **"SQL Editor"** en el menú lateral
4. Click en **"New Query"**
5. Copia y pega el siguiente SQL:

```sql
-- Agregar campos tributarios a productos
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS iva DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2) DEFAULT 0;

-- Agregar campos tributarios a materias primas  
ALTER TABLE raw_materials
ADD COLUMN IF NOT EXISTS iva DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total DECIMAL(10, 2) DEFAULT 0;

-- Actualizar valores existentes asumiendo IVA 19%
UPDATE products 
SET iva = ROUND(price_sale * 0.19, 2),
    total = ROUND(price_sale * 1.19, 2)
WHERE price_sale IS NOT NULL AND (iva IS NULL OR iva = 0);

UPDATE raw_materials
SET iva = ROUND(cost_net * 0.19, 2),
    total = ROUND(cost_net * 1.19, 2)
WHERE cost_net IS NOT NULL AND (iva IS NULL OR iva = 0);
```

6. Click en **"Run"** (o presiona Ctrl+Enter)
7. Verifica que diga "Success. No rows returned"

## Paso 2: Migración en Supabase de Bárbara

1. Abre el proyecto de Bárbara: https://supabase.com/dashboard/project/kcfuixvrwbnizspgtmtr
2. Repite los pasos 3-7 del Paso 1

## Verificación

Para confirmar que funcionó, ejecuta en SQL Editor:

```sql
SELECT code, name, price_sale, iva, total 
FROM products 
WHERE price_sale IS NOT NULL
LIMIT 5;
```

Deberías ver que las columnas `iva` y `total` tienen valores calculados.

---

**¿Listo?** Cuando hayas ejecutado el SQL en ambas bases de datos, avísame para continuar con los cambios en el código del backend y frontend.

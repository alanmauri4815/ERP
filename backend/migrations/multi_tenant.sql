-- ========================================================
-- MULTI-TENANT MIGRATION — ERP Universal SaaS
-- Convierte la base de datos single-tenant a multi-tenant
-- usando empresa_id en todas las tablas.
-- ========================================================

-- ==========================================
-- PASO 1: Crear tabla de empresas
-- ==========================================
CREATE TABLE IF NOT EXISTS empresas (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    rut TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    logo_url TEXT,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar Ross Confecciones como empresa #1
INSERT INTO empresas (nombre, rut, email)
VALUES ('Ross Confecciones', '13.267.639-9', 'ross.confecciones@gmail.com')
ON CONFLICT DO NOTHING;

-- ==========================================
-- PASO 2: Agregar empresa_id a USUARIOS
-- ==========================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE usuarios SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ==========================================
-- PASO 3: Agregar empresa_id a tablas ERP
-- ==========================================

-- Proveedores
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE proveedores SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE productos SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Materias Primas
ALTER TABLE "materias primas" ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE "materias primas" SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Recetas
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE recetas SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Clientela
ALTER TABLE clientela ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE clientela SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Ventas
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE ventas SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Sale Items
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE sale_items SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Compras
ALTER TABLE compras ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE compras SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Purchase Items
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE purchase_items SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Production
ALTER TABLE production ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE production SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Production Items
ALTER TABLE production_items ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE production_items SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE accounts SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Quotations
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE quotations SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Quotation Items
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE quotation_items SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Payment Machines
ALTER TABLE payment_machines ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE payment_machines SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Logística
ALTER TABLE logistica ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE logistica SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Logística Items
ALTER TABLE logistica_items ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE logistica_items SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE settings SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Alerts Config
ALTER TABLE alerts_config ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE alerts_config SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ==========================================
-- PASO 4: Agregar empresa_id a tablas CONTABILIDAD
-- ==========================================

-- Plan de Cuentas
ALTER TABLE plan_cuentas ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE plan_cuentas SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Asientos
ALTER TABLE asientos ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE asientos SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Asiento Movimientos
ALTER TABLE asiento_movimientos ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE asiento_movimientos SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Trabajadores
ALTER TABLE trabajadores ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE trabajadores SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Liquidaciones
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE liquidaciones SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Anticipos
ALTER TABLE anticipos ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE anticipos SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Honorarios
ALTER TABLE honorarios ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE honorarios SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Activo Fijo
ALTER TABLE activo_fijo ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE activo_fijo SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Libro Compras (Contable)
ALTER TABLE libro_compras ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE libro_compras SET empresa_id = 1 WHERE empresa_id IS NULL;

-- Libro Ventas (Contable)
ALTER TABLE libro_ventas ADD COLUMN IF NOT EXISTS empresa_id BIGINT REFERENCES empresas(id);
UPDATE libro_ventas SET empresa_id = 1 WHERE empresa_id IS NULL;

-- ==========================================
-- PASO 5: Índices para performance
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa ON proveedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ventas_empresa ON ventas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_compras_empresa ON compras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_plan_cuentas_empresa ON plan_cuentas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asientos_empresa ON asientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asiento_movimientos_empresa ON asiento_movimientos(empresa_id);

-- ==========================================
-- PASO 6: Verificación
-- ==========================================
-- Correr esto después para verificar:
-- SELECT table_name, column_name FROM information_schema.columns 
-- WHERE column_name = 'empresa_id' ORDER BY table_name;

-- ========================================================
-- INTEGRACIÓN CONTACHILE — Profesional Accounting Tables
-- Migrate this to your Supabase project (vsvaasnddphjlspukpca)
-- ========================================================

-- 1. Plan de Cuentas (Arbol Jerárquico)
CREATE TABLE IF NOT EXISTS plan_cuentas (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL, -- Ej: 1.1.01.01
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL, -- activo, pasivo, patrimonio, ingreso, gasto, costo
    nivel INTEGER DEFAULT 1,
    padre_id BIGINT REFERENCES plan_cuentas(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Asientos Contables (Voucher Header)
CREATE TABLE IF NOT EXISTS asientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    glosa TEXT NOT NULL,
    periodo TEXT NOT NULL, -- YYYY-MM
    tipo_origen TEXT DEFAULT 'manual', -- manual, venta, compra, remuneraciones
    referencia_id TEXT, -- ID de la tabla de origen
    usuario_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Movimientos (Journal Lines)
CREATE TABLE IF NOT EXISTS asiento_movimientos (
    id BIGSERIAL PRIMARY KEY,
    asiento_id UUID REFERENCES asientos(id) ON DELETE CASCADE,
    cuenta_codigo TEXT REFERENCES plan_cuentas(codigo),
    debe NUMERIC DEFAULT 0,
    haber NUMERIC DEFAULT 0,
    centro_costo_id INTEGER, -- Opcional para analítica
    glosa_linea TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. RRHH — Trabajadores
CREATE TABLE IF NOT EXISTS trabajadores (
    id BIGSERIAL PRIMARY KEY,
    rut TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    fecha_ingreso DATE,
    cargo TEXT,
    sueldo_base NUMERIC NOT NULL,
    tipo_gratificacion TEXT DEFAULT 'Art 50', -- Art 50, No
    afp TEXT,
    afp_tasa NUMERIC,
    salud TEXT DEFAULT 'Fonasa', -- Fonasa, Isapre
    plan_isapre_uf NUMERIC DEFAULT 0,
    cargas_familiares INTEGER DEFAULT 0,
    jornada_semanal INTEGER DEFAULT 45,
    estado TEXT DEFAULT 'activo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. RRHH — Liquidaciones de Sueldo
CREATE TABLE IF NOT EXISTS liquidaciones (
    id BIGSERIAL PRIMARY KEY,
    trabajador_id BIGINT REFERENCES trabajadores(id),
    periodo TEXT NOT NULL, -- YYYY-MM
    sueldo_base NUMERIC,
    gratificacion NUMERIC,
    total_imponible NUMERIC,
    movilizacion NUMERIC,
    colacion NUMERIC,
    horas_extras_monto NUMERIC,
    horas_extras_cantidad NUMERIC,
    bonos_imponibles NUMERIC,
    aguinaldos_imponibles NUMERIC,
    asignacion_familiar NUMERIC,
    descuento_afp NUMERIC,
    descuento_salud NUMERIC,
    descuento_cesantia NUMERIC,
    anticipos_monto NUMERIC,
    alcanze_liquido NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. RRHH — Anticipos
CREATE TABLE IF NOT EXISTS anticipos (
    id BIGSERIAL PRIMARY KEY,
    trabajador_id BIGINT REFERENCES trabajadores(id),
    monto NUMERIC NOT NULL,
    fecha DATE NOT NULL,
    glosa TEXT,
    periodo TEXT,
    estado TEXT DEFAULT 'pendiente', -- pendiente, descontado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Honorarios (Boletas de Terceros)
CREATE TABLE IF NOT EXISTS honorarios (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL,
    rut TEXT NOT NULL,
    profesional TEXT NOT NULL,
    glosa TEXT,
    bruto NUMERIC NOT NULL,
    retencion NUMERIC,
    liquido NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Activo Fijo (Inventario y Depreciación)
CREATE TABLE IF NOT EXISTS activo_fijo (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    categoria TEXT,
    fecha_adquisicion DATE NOT NULL,
    valor_compra NUMERIC NOT NULL,
    vida_util_meses INTEGER,
    valor_residual NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices para Performance
CREATE INDEX idx_asientos_periodo ON asientos(periodo);
CREATE INDEX idx_movimientos_asiento ON asiento_movimientos(asiento_id);
CREATE INDEX idx_movimientos_cuenta ON asiento_movimientos(cuenta_codigo);
CREATE INDEX idx_liquidaciones_periodo ON liquidaciones(periodo);

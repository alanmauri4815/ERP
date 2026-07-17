-- Permite reutilizar el mismo codigo de producto/insumo en empresas distintas.
-- La unicidad pasa de "code" global a "(empresa_id, code)".

BEGIN;

-- Los registros historicos sin empresa pertenecen a la empresa base.
UPDATE public.productos
SET empresa_id = 1
WHERE empresa_id IS NULL;

UPDATE public."materias primas"
SET empresa_id = 1
WHERE empresa_id IS NULL;

-- Elimina la primary key global actual de productos, sin asumir nombre.
DO $$
DECLARE
    pk_name text;
BEGIN
    SELECT con.conname
    INTO pk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'productos'
      AND con.contype = 'p';

    IF pk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.productos DROP CONSTRAINT %I', pk_name);
    END IF;
END $$;

-- Elimina la primary key global actual de materias primas, sin asumir nombre.
DO $$
DECLARE
    pk_name text;
BEGIN
    SELECT con.conname
    INTO pk_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'materias primas'
      AND con.contype = 'p';

    IF pk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', 'materias primas', pk_name);
    END IF;
END $$;

ALTER TABLE public.productos
    ALTER COLUMN code SET NOT NULL,
    ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE public."materias primas"
    ALTER COLUMN code SET NOT NULL,
    ALTER COLUMN empresa_id SET NOT NULL;

ALTER TABLE public.productos
    ADD CONSTRAINT productos_empresa_code_pkey PRIMARY KEY (empresa_id, code);

ALTER TABLE public."materias primas"
    ADD CONSTRAINT materias_primas_empresa_code_pkey PRIMARY KEY (empresa_id, code);

COMMIT;

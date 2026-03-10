-- ==========================================
-- FIX: Permitir el mismo username en distintas empresas
-- ==========================================

-- 1. Buscar el nombre de la restricción de usuario único actual
-- (Casi siempre se llama "usuarios_username_key")
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_username_key;

-- 2. Crear nueva restricción que combine username + empresa_id
-- Esto permite que 'Mavamudi' exista en Empresa 1 y en Empresa 2
ALTER TABLE usuarios ADD CONSTRAINT uq_username_empresa UNIQUE (username, empresa_id);

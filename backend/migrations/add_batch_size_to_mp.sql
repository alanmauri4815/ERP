-- Add batch_size to materias primas
ALTER TABLE "materias primas" ADD COLUMN batch_size NUMERIC DEFAULT 1;

-- Update existing records to have 1 as default
UPDATE "materias primas" SET batch_size = 1 WHERE batch_size IS NULL;

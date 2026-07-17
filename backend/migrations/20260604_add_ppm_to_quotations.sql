BEGIN;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS ppm_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppm_amount numeric DEFAULT 0;

UPDATE public.quotations
SET
  ppm_percentage = COALESCE(ppm_percentage, 0),
  ppm_amount = COALESCE(ppm_amount, 0);

COMMIT;

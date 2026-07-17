-- Allow purchase lines to reference merchandise stored in the products catalog.
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS product_code text;

CREATE INDEX IF NOT EXISTS idx_purchase_items_product_code
  ON public.purchase_items (product_code);

COMMENT ON COLUMN public.purchase_items.product_code IS
  'Product catalog code used when the purchase header type is merchandise.';

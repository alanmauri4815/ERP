-- Migration to add discount and commission fields to sales
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS discount INTEGER DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS commission INTEGER DEFAULT 0;

-- Optional: If you want to store these in sale_items too for line-by-line detail (as seen in the Excel)
-- ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL DEFAULT 0;

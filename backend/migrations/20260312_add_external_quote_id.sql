-- Migration to add external_quote_id to quotations table
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS external_quote_id TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS purchase_order_id TEXT;

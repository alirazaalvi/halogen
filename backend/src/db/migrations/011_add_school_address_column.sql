-- Add address column to schools table
ALTER TABLE schools ADD COLUMN IF NOT EXISTS address TEXT;

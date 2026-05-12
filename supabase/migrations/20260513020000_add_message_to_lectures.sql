-- Add message board field to lectures and make file_path optional
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE lectures ALTER COLUMN file_path DROP NOT NULL;

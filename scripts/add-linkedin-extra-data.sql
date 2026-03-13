-- Add a JSONB column to store all extra LinkedIn data
ALTER TABLE champions 
ADD COLUMN IF NOT EXISTS linkedin_data JSONB DEFAULT '{}';

-- Add comment to explain the column
COMMENT ON COLUMN champions.linkedin_data IS 'Stores all extra LinkedIn fields that dont have dedicated columns';

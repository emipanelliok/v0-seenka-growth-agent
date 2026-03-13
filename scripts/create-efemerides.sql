-- Efemerides table: fechas comerciales/marketing por país e industria
CREATE TABLE IF NOT EXISTS efemerides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  countries TEXT[] NOT NULL DEFAULT '{}',
  industries TEXT[] NOT NULL DEFAULT '{}',
  event_date DATE NOT NULL,
  reminder_days_before INT NOT NULL DEFAULT 30,
  seenka_data_hint TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE efemerides ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own efemerides" ON efemerides
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own efemerides" ON efemerides
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own efemerides" ON efemerides
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own efemerides" ON efemerides
  FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_efemerides_user_id ON efemerides(user_id);
CREATE INDEX IF NOT EXISTS idx_efemerides_event_date ON efemerides(event_date);
CREATE INDEX IF NOT EXISTS idx_efemerides_countries ON efemerides USING GIN(countries);

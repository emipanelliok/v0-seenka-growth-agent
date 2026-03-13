-- Champions table
CREATE TABLE IF NOT EXISTS champions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  linkedin_url TEXT,
  role TEXT,
  company TEXT,
  industry TEXT,
  country TEXT,
  champion_level TEXT DEFAULT 'medium' CHECK (champion_level IN ('high', 'medium', 'low')),
  status TEXT DEFAULT 'listening' CHECK (status IN ('listening', 'trigger_detected', 'contacted', 'responded', 'opportunity', 'paused')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Triggers table
CREATE TABLE IF NOT EXISTS triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_id UUID NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('post', 'data_seenka', 'market_context')),
  source_text TEXT NOT NULL,
  topic TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
  is_worth_contacting BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interactions table
CREATE TABLE IF NOT EXISTS interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_id UUID NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES triggers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('linkedin', 'email')),
  message TEXT NOT NULL,
  insight TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  response TEXT,
  outcome TEXT DEFAULT 'sent' CHECK (outcome IN ('sent', 'responded', 'ignored')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE champions ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for champions
CREATE POLICY "Users can view their own champions" ON champions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own champions" ON champions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own champions" ON champions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own champions" ON champions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for triggers (via champion ownership)
CREATE POLICY "Users can view triggers for their champions" ON triggers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = triggers.champion_id AND champions.user_id = auth.uid())
  );

CREATE POLICY "Users can insert triggers for their champions" ON triggers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = triggers.champion_id AND champions.user_id = auth.uid())
  );

CREATE POLICY "Users can update triggers for their champions" ON triggers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = triggers.champion_id AND champions.user_id = auth.uid())
  );

CREATE POLICY "Users can delete triggers for their champions" ON triggers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = triggers.champion_id AND champions.user_id = auth.uid())
  );

-- RLS Policies for interactions (via champion ownership)
CREATE POLICY "Users can view interactions for their champions" ON interactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = interactions.champion_id AND champions.user_id = auth.uid())
  );

CREATE POLICY "Users can insert interactions for their champions" ON interactions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = interactions.champion_id AND champions.user_id = auth.uid())
  );

CREATE POLICY "Users can update interactions for their champions" ON interactions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = interactions.champion_id AND champions.user_id = auth.uid())
  );

CREATE POLICY "Users can delete interactions for their champions" ON interactions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM champions WHERE champions.id = interactions.champion_id AND champions.user_id = auth.uid())
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_champions_user_id ON champions(user_id);
CREATE INDEX IF NOT EXISTS idx_champions_status ON champions(status);
CREATE INDEX IF NOT EXISTS idx_triggers_champion_id ON triggers(champion_id);
CREATE INDEX IF NOT EXISTS idx_interactions_champion_id ON interactions(champion_id);
CREATE INDEX IF NOT EXISTS idx_interactions_trigger_id ON interactions(trigger_id);

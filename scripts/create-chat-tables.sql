-- Chat con Gastón: tablas para conversaciones y aprendizajes
-- Ejecutar en Supabase SQL Editor

-- Conversaciones
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  title text DEFAULT 'Nueva conversación',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_archived boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Mensajes del chat
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES chat_conversations ON DELETE CASCADE NOT NULL,
  role text CHECK (role IN ('user', 'assistant', 'tool', 'system')) NOT NULL,
  content text,
  tool_calls jsonb,
  created_at timestamptz DEFAULT now()
);

-- Aprendizajes de Gastón (Fase 3, pero creamos la tabla ahora)
CREATE TABLE IF NOT EXISTS gaston_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  category text CHECK (category IN (
    'qualification_criteria',
    'messaging_style',
    'data_preferences',
    'workflow_patterns',
    'domain_knowledge'
  )) NOT NULL,
  content text NOT NULL,
  source_conversation_id uuid REFERENCES chat_conversations,
  confidence float DEFAULT 0.5,
  times_reinforced int DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_gaston_learnings_user ON gaston_learnings(user_id);

-- RLS
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaston_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own conversations"
  ON chat_conversations FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users see own chat messages"
  ON chat_messages FOR ALL
  USING (conversation_id IN (
    SELECT id FROM chat_conversations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users see own learnings"
  ON gaston_learnings FOR ALL
  USING (auth.uid() = user_id);

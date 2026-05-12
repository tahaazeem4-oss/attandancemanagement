-- ── Chat Conversations ────────────────────────────────────────
-- One row per unique parent ↔ teacher/admin pairing
CREATE TABLE IF NOT EXISTS chat_conversations (
  id                 SERIAL PRIMARY KEY,
  school_id          INT          NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id          INT          NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  participant_id     INT          NOT NULL,
  participant_type   VARCHAR(10)  NOT NULL CHECK (participant_type IN ('teacher', 'admin')),
  created_at         TIMESTAMPTZ  DEFAULT NOW(),
  last_message_at    TIMESTAMPTZ  DEFAULT NOW(),
  last_message_text  VARCHAR(500) DEFAULT NULL,
  UNIQUE (parent_id, participant_id, participant_type)
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_parent       ON chat_conversations(parent_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_participant  ON chat_conversations(participant_id, participant_type);
CREATE INDEX IF NOT EXISTS idx_chat_conv_school       ON chat_conversations(school_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_last_msg     ON chat_conversations(last_message_at DESC);

-- ── Chat Messages ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id               SERIAL PRIMARY KEY,
  conversation_id  INT         NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id        INT         NOT NULL,
  sender_type      VARCHAR(10) NOT NULL CHECK (sender_type IN ('parent', 'teacher', 'admin')),
  content          TEXT        NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  is_edited        BOOLEAN     DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv   ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_msg_sender ON chat_messages(sender_id, sender_type);

-- ── Chat Message Reads ────────────────────────────────────────
-- Tracks when a recipient opened/read messages
CREATE TABLE IF NOT EXISTS chat_message_reads (
  id           SERIAL PRIMARY KEY,
  message_id   INT         NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  reader_id    INT         NOT NULL,
  reader_type  VARCHAR(10) NOT NULL CHECK (reader_type IN ('parent', 'teacher', 'admin')),
  read_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, reader_id, reader_type)
);

CREATE INDEX IF NOT EXISTS idx_chat_reads_message ON chat_message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_reads_reader  ON chat_message_reads(reader_id, reader_type);

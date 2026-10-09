-- Store one push token per device instead of one per account.
--
-- Previously push_tokens was UNIQUE (user_role, user_id), so signing into the same
-- account on a second device overwrote the first device's token, and logging out
-- anywhere deleted the account's only token. Now each Expo token (one per device
-- install) is its own row; a device that switches accounts is reassigned on upsert.

-- Drop whatever unique constraint currently covers (user_role, user_id).
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'push_tokens'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname)
        FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
      ) = ARRAY['user_id', 'user_role']
  LOOP
    EXECUTE format('ALTER TABLE push_tokens DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

-- Remove duplicate tokens (keep the most recent row) before adding the constraint.
DELETE FROM push_tokens p
USING push_tokens newer
WHERE p.token = newer.token
  AND (COALESCE(newer.updated_at, '-infinity'), newer.id)
    > (COALESCE(p.updated_at, '-infinity'), p.id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'push_tokens'::regclass AND conname = 'push_tokens_token_key'
  ) THEN
    ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_token_key UNIQUE (token);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON push_tokens (user_role, user_id);

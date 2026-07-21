-- Drop unsupported consent persistence and user privacy preference columns.
DROP TABLE IF EXISTS "consent_records";

ALTER TABLE "users"
DROP COLUMN IF EXISTS "analytics_visibility",
DROP COLUMN IF EXISTS "ai_interaction_consent",
DROP COLUMN IF EXISTS "data_sharing_consent";

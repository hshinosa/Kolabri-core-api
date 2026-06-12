ALTER TABLE "courses"
ADD COLUMN "ai_guardrail_config" JSONB;

UPDATE "courses"
SET "ai_guardrail_config" = jsonb_build_object(
  'preset', 'balanced',
  'allowRewrite', true,
  'allowFlagOnly', false
)
WHERE "ai_guardrail_config" IS NULL;

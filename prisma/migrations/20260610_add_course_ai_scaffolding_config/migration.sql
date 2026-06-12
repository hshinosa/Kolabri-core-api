ALTER TABLE "courses"
ADD COLUMN "ai_scaffolding_config" JSONB;

UPDATE "courses"
SET "ai_scaffolding_config" = jsonb_build_object(
  'scaffoldingLevel', 'auto',
  'enabled', true
)
WHERE "ai_scaffolding_config" IS NULL;

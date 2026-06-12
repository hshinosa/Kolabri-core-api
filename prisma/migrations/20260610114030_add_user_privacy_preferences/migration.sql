-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_interaction_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "analytics_visibility" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "data_sharing_consent" BOOLEAN NOT NULL DEFAULT false;

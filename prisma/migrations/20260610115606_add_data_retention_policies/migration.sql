-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('USER', 'COURSE', 'GROUP', 'CHAT_SPACE', 'KNOWLEDGE_BASE', 'CHAT_LOG');

-- CreateTable
CREATE TABLE "data_retention_policies" (
    "id" TEXT NOT NULL,
    "dataType" "DataType" NOT NULL,
    "retention_days" INTEGER NOT NULL DEFAULT 365,
    "archive_after_days" INTEGER NOT NULL DEFAULT 180,
    "auto_purge" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_policies_dataType_key" ON "data_retention_policies"("dataType");

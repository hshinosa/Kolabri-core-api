ALTER TABLE "chat_spaces"
    ADD COLUMN "summary" TEXT,
    ADD COLUMN "summary_generated_at" TIMESTAMP(3);

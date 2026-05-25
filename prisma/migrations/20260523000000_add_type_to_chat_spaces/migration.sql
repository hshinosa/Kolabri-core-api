ALTER TABLE "chat_spaces" ADD COLUMN "type" TEXT;
CREATE INDEX "chat_spaces_group_id_type_idx" ON "chat_spaces"("group_id", "type");

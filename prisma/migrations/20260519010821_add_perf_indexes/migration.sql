-- Performance indexes for hot-path queries

-- Backfill missing deleted_at columns (drift remediation: schema.prisma had soft-delete
-- fields but earlier migrations didn't create the columns)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "is_archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "archived_by_id" TEXT;
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "chat_spaces" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Group: filter active groups per course
CREATE INDEX "groups_course_id_deleted_at_idx" ON "groups"("course_id", "deleted_at");

-- ChatSpace: filter active chatSpaces per group
CREATE INDEX "chat_spaces_group_id_deleted_at_idx" ON "chat_spaces"("group_id", "deleted_at");

-- ChatMessage: history pagination per chatSpace
CREATE INDEX "chat_messages_chat_space_id_created_at_idx" ON "chat_messages"("chat_space_id", "created_at");

-- LearningGoal: per-chatSpace + per-user goal lookups
CREATE INDEX "learning_goals_chat_space_id_idx" ON "learning_goals"("chat_space_id");
CREATE INDEX "learning_goals_user_id_idx" ON "learning_goals"("user_id");
CREATE INDEX "learning_goals_chat_space_id_user_id_idx" ON "learning_goals"("chat_space_id", "user_id");

-- Reflection: dashboard + history queries
CREATE INDEX "reflections_user_id_idx" ON "reflections"("user_id");
CREATE INDEX "reflections_goal_id_idx" ON "reflections"("goal_id");
CREATE INDEX "reflections_chat_space_id_user_id_idx" ON "reflections"("chat_space_id", "user_id");
CREATE INDEX "reflections_user_id_created_at_idx" ON "reflections"("user_id", "created_at");

-- AiChatMessage: pagination per chat
CREATE INDEX "ai_chat_messages_chat_id_created_at_idx" ON "ai_chat_messages"("chat_id", "created_at");

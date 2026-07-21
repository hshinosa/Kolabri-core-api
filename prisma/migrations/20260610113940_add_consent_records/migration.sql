-- CreateEnum
CREATE TYPE "AbTestStatus" AS ENUM ('draft', 'active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('info', 'success', 'warning', 'error');

-- AlterEnum
ALTER TYPE "VectorStatus" ADD VALUE 'skipped';

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "is_pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinned_at" TIMESTAMP(3),
ADD COLUMN     "pinned_by" TEXT,
ADD COLUMN     "thread_id" TEXT,
ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "ai_escalation_config" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "language_preference" TEXT DEFAULT 'id',
ADD COLUMN     "theme_preference" TEXT DEFAULT 'system';

-- CreateTable
CREATE TABLE "course_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "name_pattern" TEXT NOT NULL,
    "description_template" TEXT,
    "default_groups" JSONB NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "base_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "fallback_order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "estimated_cost" DOUBLE PRECISION NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_comparisons" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_comparison_results" (
    "id" TEXT NOT NULL,
    "comparison_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_id" TEXT,
    "model" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL,
    "completion_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "estimated_cost" DOUBLE PRECISION NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_comparison_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_ab_tests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "course_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "status" "AbTestStatus" NOT NULL DEFAULT 'draft',
    "variant_a" JSONB NOT NULL,
    "variant_b" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_ab_test_results" (
    "id" TEXT NOT NULL,
    "test_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_ab_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_states" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "chat_space_id" TEXT NOT NULL,
    "issue_type" TEXT NOT NULL,
    "current_stage" TEXT NOT NULL,
    "history" JSONB NOT NULL DEFAULT '[]',
    "last_checked_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "notification_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escalation_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_templates_created_by_id_idx" ON "course_templates"("created_by_id");

-- CreateIndex
CREATE INDEX "course_templates_created_at_idx" ON "course_templates"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_name_key" ON "ai_providers"("name");

-- CreateIndex
CREATE INDEX "ai_providers_is_active_fallback_order_idx" ON "ai_providers"("is_active", "fallback_order");

-- CreateIndex
CREATE INDEX "ai_usages_user_id_created_at_idx" ON "ai_usages"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usages_course_id_created_at_idx" ON "ai_usages"("course_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usages_provider_created_at_idx" ON "ai_usages"("provider", "created_at");

-- CreateIndex
CREATE INDEX "ai_model_comparisons_created_by_created_at_idx" ON "ai_model_comparisons"("created_by", "created_at");

-- CreateIndex
CREATE INDEX "ai_model_comparison_results_comparison_id_idx" ON "ai_model_comparison_results"("comparison_id");

-- CreateIndex
CREATE INDEX "ai_model_comparison_results_provider_model_idx" ON "ai_model_comparison_results"("provider", "model");

-- CreateIndex
CREATE INDEX "ai_ab_tests_created_by_status_idx" ON "ai_ab_tests"("created_by", "status");

-- CreateIndex
CREATE INDEX "ai_ab_tests_course_id_idx" ON "ai_ab_tests"("course_id");

-- CreateIndex
CREATE INDEX "ai_ab_tests_created_at_idx" ON "ai_ab_tests"("created_at");

-- CreateIndex
CREATE INDEX "ai_ab_test_results_test_id_idx" ON "ai_ab_test_results"("test_id");

-- CreateIndex
CREATE INDEX "ai_ab_test_results_user_id_idx" ON "ai_ab_test_results"("user_id");

-- CreateIndex
CREATE INDEX "ai_ab_test_results_test_id_variant_idx" ON "ai_ab_test_results"("test_id", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "ai_ab_test_results_test_id_user_id_key" ON "ai_ab_test_results"("test_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens"("email");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_email_idx" ON "email_verification_tokens"("email");

-- CreateIndex
CREATE INDEX "email_verification_tokens_token_idx" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "escalation_states_course_id_current_stage_idx" ON "escalation_states"("course_id", "current_stage");

-- CreateIndex
CREATE INDEX "escalation_states_group_id_current_stage_idx" ON "escalation_states"("group_id", "current_stage");

-- CreateIndex
CREATE INDEX "escalation_states_chat_space_id_issue_type_current_stage_idx" ON "escalation_states"("chat_space_id", "issue_type", "current_stage");

-- CreateIndex
CREATE INDEX "ai_chat_messages_chat_id_idx" ON "ai_chat_messages"("chat_id");

-- CreateIndex
CREATE INDEX "ai_chats_user_id_idx" ON "ai_chats"("user_id");

-- CreateIndex
CREATE INDEX "chat_messages_chat_space_id_idx" ON "chat_messages"("chat_space_id");

-- CreateIndex
CREATE INDEX "chat_messages_sender_id_idx" ON "chat_messages"("sender_id");

-- CreateIndex
CREATE INDEX "chat_messages_chat_space_id_is_pinned_created_at_idx" ON "chat_messages"("chat_space_id", "is_pinned", "created_at");

-- CreateIndex
CREATE INDEX "chat_spaces_group_id_idx" ON "chat_spaces"("group_id");

-- CreateIndex
CREATE INDEX "chat_spaces_deleted_at_idx" ON "chat_spaces"("deleted_at");

-- CreateIndex
CREATE INDEX "course_students_course_id_idx" ON "course_students"("course_id");

-- CreateIndex
CREATE INDEX "course_students_user_id_idx" ON "course_students"("user_id");

-- CreateIndex
CREATE INDEX "courses_owner_id_idx" ON "courses"("owner_id");

-- CreateIndex
CREATE INDEX "courses_code_idx" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_is_active_idx" ON "courses"("is_active");

-- CreateIndex
CREATE INDEX "courses_is_archived_idx" ON "courses"("is_archived");

-- CreateIndex
CREATE INDEX "courses_created_at_idx" ON "courses"("created_at");

-- CreateIndex
CREATE INDEX "courses_owner_id_is_active_idx" ON "courses"("owner_id", "is_active");

-- CreateIndex
CREATE INDEX "courses_deleted_at_idx" ON "courses"("deleted_at");

-- CreateIndex
CREATE INDEX "group_members_group_id_idx" ON "group_members"("group_id");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE INDEX "groups_course_id_idx" ON "groups"("course_id");

-- CreateIndex
CREATE INDEX "groups_deleted_at_idx" ON "groups"("deleted_at");

-- CreateIndex
CREATE INDEX "knowledge_bases_course_id_idx" ON "knowledge_bases"("course_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_uploaded_by_idx" ON "knowledge_bases"("uploaded_by");

-- CreateIndex
CREATE INDEX "knowledge_bases_deleted_at_idx" ON "knowledge_bases"("deleted_at");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_archived_by_id_fkey" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_templates" ADD CONSTRAINT "course_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_comparisons" ADD CONSTRAINT "ai_model_comparisons_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_comparison_results" ADD CONSTRAINT "ai_model_comparison_results_comparison_id_fkey" FOREIGN KEY ("comparison_id") REFERENCES "ai_model_comparisons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_comparison_results" ADD CONSTRAINT "ai_model_comparison_results_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_ab_tests" ADD CONSTRAINT "ai_ab_tests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_ab_tests" ADD CONSTRAINT "ai_ab_tests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_ab_test_results" ADD CONSTRAINT "ai_ab_test_results_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "ai_ab_tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_ab_test_results" ADD CONSTRAINT "ai_ab_test_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

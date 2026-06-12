-- AlterTable
ALTER TABLE "chat_spaces" ADD COLUMN     "week_id" TEXT;

-- AlterTable
ALTER TABLE "knowledge_bases" ADD COLUMN     "course_material_id" TEXT,
ADD COLUMN     "week_id" TEXT,
ADD COLUMN     "week_index" INTEGER;

-- CreateTable
CREATE TABLE "chat_space_pre_read_completions" (
    "id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "chat_space_id" TEXT NOT NULL,

    CONSTRAINT "chat_space_pre_read_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_space_pre_read_completions_chat_space_id_idx" ON "chat_space_pre_read_completions"("chat_space_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_space_pre_read_completions_user_id_chat_space_id_key" ON "chat_space_pre_read_completions"("user_id", "chat_space_id");

-- CreateIndex
CREATE INDEX "chat_spaces_week_id_idx" ON "chat_spaces"("week_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_course_id_week_index_idx" ON "knowledge_bases"("course_id", "week_index");

-- CreateIndex
CREATE INDEX "knowledge_bases_course_material_id_idx" ON "knowledge_bases"("course_material_id");

-- AddForeignKey
ALTER TABLE "chat_space_pre_read_completions" ADD CONSTRAINT "chat_space_pre_read_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_space_pre_read_completions" ADD CONSTRAINT "chat_space_pre_read_completions_chat_space_id_fkey" FOREIGN KEY ("chat_space_id") REFERENCES "chat_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

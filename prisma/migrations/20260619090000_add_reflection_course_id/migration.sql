-- AlterTable
ALTER TABLE "reflections" ADD COLUMN "course_id" TEXT;

-- CreateIndex
CREATE INDEX "reflections_course_id_user_id_idx" ON "reflections"("course_id", "user_id");

-- AddForeignKey
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

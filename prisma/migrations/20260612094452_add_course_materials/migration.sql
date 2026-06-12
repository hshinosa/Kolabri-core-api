-- CreateTable
CREATE TABLE "course_materials" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "module_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_materials_course_id_idx" ON "course_materials"("course_id");

-- AddForeignKey
ALTER TABLE "course_week_materials" ADD CONSTRAINT "course_week_materials_course_material_id_fkey" FOREIGN KEY ("course_material_id") REFERENCES "course_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

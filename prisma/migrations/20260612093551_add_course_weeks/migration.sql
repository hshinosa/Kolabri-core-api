-- CreateTable
CREATE TABLE "course_weeks" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "week_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_week_materials" (
    "id" TEXT NOT NULL,
    "course_week_id" TEXT NOT NULL,
    "course_material_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_week_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_weeks_course_id_week_index_key" ON "course_weeks"("course_id", "week_index");

-- CreateIndex
CREATE INDEX "course_week_materials_course_week_id_sort_order_idx" ON "course_week_materials"("course_week_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "course_week_materials_course_week_id_course_material_id_key" ON "course_week_materials"("course_week_id", "course_material_id");

-- AddForeignKey
ALTER TABLE "course_weeks" ADD CONSTRAINT "course_weeks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_week_materials" ADD CONSTRAINT "course_week_materials_course_week_id_fkey" FOREIGN KEY ("course_week_id") REFERENCES "course_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

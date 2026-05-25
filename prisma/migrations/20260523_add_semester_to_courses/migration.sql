-- AlterTable: Add semester and academic_year columns to courses table
ALTER TABLE "courses" ADD COLUMN "semester" TEXT;
ALTER TABLE "courses" ADD COLUMN "academic_year" TEXT;

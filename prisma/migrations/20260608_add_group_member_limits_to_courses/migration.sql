ALTER TABLE "courses"
ADD COLUMN "min_members_per_group" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "max_members_per_group" INTEGER NOT NULL DEFAULT 1000;

-- Penilaian capaian tujuan per sesi (diisi server saat sesi ditutup)
ALTER TABLE "session_discussions" ADD COLUMN "goal_assessment" JSONB;

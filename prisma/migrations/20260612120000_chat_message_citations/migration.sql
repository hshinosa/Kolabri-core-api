-- Store AI citation metadata on chat messages (canonical course_material_id)
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "citations" JSONB;
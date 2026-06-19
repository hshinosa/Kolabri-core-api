-- AddColumn: citations to ai_chat_messages
-- Stores RAG citations for AI assistant messages in personal chat
ALTER TABLE "ai_chat_messages" ADD COLUMN "citations" JSONB;

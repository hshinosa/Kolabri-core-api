/**
 * AI Engine Service
 * 
 * Handles communication with the AI Engine (FastAPI) service.
 * Provides RAG queries, document ingestion, and chat interventions.
 */

import fs from 'fs/promises';
import { Blob } from 'node:buffer';
import { logger } from '../utils/logger.js';

// Types
interface AskResponse {
    answer: string;
    success: boolean;
    error?: string;
}

interface IngestResponse {
    success: boolean;
    message: string;
    file_id: string;
    document_id: string;
    chunks_created: number;
    processing_time_ms: number;
}

interface BatchDocumentResult {
    filename: string;
    status: 'success' | 'error' | 'skipped';
    chunks_created?: number;
    document_type?: string;
    error?: string;
}

interface DocumentProcessingStats {
    total_files: number;
    successful: number;
    failed: number;
    skipped: number;
    total_chunks: number;
    document_types: Record<string, number>;
    images_extracted: number;
    ocr_performed: boolean;
}

interface BatchUploadResponse {
    success: boolean;
    message: string;
    processing_time_ms: number;
    batch_id: string;
    results: BatchDocumentResult[];
    stats: DocumentProcessingStats;
}

interface InterventionRequest {
    messages: Array<{
        sender: string;
        content: string;
        timestamp?: string;
        sender_id?: string;
    }>;
    topic: string;
    chat_room_id: string;
    intervention_type?: string;
    force?: boolean;
}

interface InterventionResponse {
    success: boolean;
    should_intervene: boolean;
    message: string;
    intervention_type: string;
    confidence: number;
    reason: string;
    error?: string;
}

interface SummaryResponse {
    success: boolean;
    summary: string;
    message_count: number;
    error?: string;
}

interface HealthResponse {
    status: string;
    version: string;
    timestamp: string;
    services: {
        vector_store: boolean;
        llm: boolean;
    };
}

// ============== Orchestration Types (Teacher-AI Complementarity) ==============

interface OrchestrationRequest {
    user_id: string;
    group_id: string;
    message: string;
    topic?: string;
    collection_name?: string;
    course_id?: string;
    chat_room_id?: string;
}

interface OrchestrationResponse {
    success: boolean;
    bot_response: string;
    system_intervention?: string;
    intervention_type?: string;
    action_taken: string;
    should_notify_teacher: boolean;
    quality_score?: number;
    meta?: GroupAnalyticsMeta;
    error?: string;
}

interface GroupAnalyticsMeta {
    message_count: number;
    hot_percentage: number;
    lexical_variety_avg: number;
    engagement_distribution: Record<string, number>;
    participants: string[];
    last_intervention_time?: string;
}

interface GroupAnalyticsResponse {
    success: boolean;
    group_id: string;
    message_count?: number;
    quality_score?: number;
    quality_breakdown?: Record<string, number>;
    recommendation?: string;
    participants?: string[];
    participant_count?: number;
    engagement_distribution?: Record<string, number>;
    hot_percentage?: number;
    error?: string;
}

interface EngagementAnalysisRequest {
    text: string;
}

interface EngagementAnalysisResponse {
    success: boolean;
    lexical_variety: number;
    engagement_type: 'Cognitive' | 'Behavioral' | 'Emotional' | 'unknown';
    is_higher_order: boolean;
    hot_indicators: string[];
    word_count: number;
    unique_words: number;
    confidence: number;
    error?: string;
}

interface ProcessMiningExportResponse {
    success: boolean;
    file_url: string;
    total_events?: number;
    unique_cases?: number;
    message?: string;
    error?: string;
}

/**
 * AI Engine Service Class
 */
export class AIEngineService {
    private baseUrl: string;
    private secret: string;
    private timeout: number;

    constructor() {
        this.baseUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
        this.secret = process.env.AI_ENGINE_SECRET || '';
        this.timeout = 30000; // 30 seconds
    }

    /**
     * Get headers for AI Engine requests
     */
    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.secret) {
            headers['Authorization'] = `Bearer ${this.secret}`;
        }

        return headers;
    }

    /**
     * Check if AI Engine is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const data = await response.json() as HealthResponse;
                return data.status === 'healthy' || data.status === 'degraded';
            }
            return false;
        } catch (error) {
            logger.warn('AI Engine health check failed:', error);
            return false;
        }
    }

    /**
     * Ask a question using RAG (for @AI mentions in chat)
     */
    async ask(
        query: string,
        courseId: string,
        userName?: string,
        chatSpaceId?: string
    ): Promise<AskResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/ask`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    query,
                    course_id: courseId,
                    user_name: userName,
                    chat_space_id: chatSpaceId,
                }),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            const data = await response.json() as AskResponse;
            return data;
        } catch (error) {
            logger.error('AI Engine ask failed:', error);
            return {
                answer: 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Ingest a PDF document into the vector store
     */
    async ingestDocument(
        fileId: string,
        filePath: string,
        courseId: string,
        fileName: string
    ): Promise<IngestResponse> {
        try {
            // Read file
            const fileBuffer = await fs.readFile(filePath);

            // Create form data
            const formData = new FormData();
            const fileBlob = new Blob([fileBuffer], {
                type: 'application/pdf',
            });
            formData.append('file', fileBlob, fileName);
            formData.append('course_id', courseId);
            formData.append('file_id', fileId);

            const headers: Record<string, string> = {};
            if (this.secret) {
                headers['X-API-Key'] = this.secret;
            }

            const response = await fetch(`${this.baseUrl}/api/ingest`, {
                method: 'POST',
                headers,
                body: formData,
                signal: AbortSignal.timeout(60000), // 60 seconds for file processing
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI Engine responded with ${response.status}: ${errorText}`);
            }

            const data = await response.json() as IngestResponse;
            return data;
        } catch (error) {
            logger.error('AI Engine ingest failed:', error);
            throw error;
        }
    }

    /**
     * Delete a document from the vector store
     */
    async deleteDocument(
        documentId: string,
        collectionName?: string
    ): Promise<boolean> {
        try {
            const url = new URL(`${this.baseUrl}/api/documents/${documentId}`);
            if (collectionName) {
                url.searchParams.append('collection_name', collectionName);
            }

            const response = await fetch(url.toString(), {
                method: 'DELETE',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(this.timeout),
            });

            return response.ok;
        } catch (error) {
            logger.error('AI Engine delete document failed:', error);
            return false;
        }
    }

    /**
     * Batch upload documents (supports ZIP files and multiple documents)
     * Supports: PDF, DOCX, PPTX, TXT, MD, images (PNG, JPG, etc.)
     * 
     * When uploading a ZIP file, it will be extracted and all supported
     * documents inside will be processed, including nested folders.
     */
    async ingestBatch(
        files: Array<{ path: string; name: string }>,
        courseId: string,
        options?: {
            extractImages?: boolean;
            performOcr?: boolean;
        }
    ): Promise<BatchUploadResponse> {
        try {
            const formData = new FormData();

            // Add all files
            for (const file of files) {
                const fileBuffer = await fs.readFile(file.path);
                const contentType = this.getContentType(file.name);
                const blob = new Blob([fileBuffer], { type: contentType });
                formData.append('files', blob, file.name);
            }

            // Add metadata
            formData.append('course_id', courseId);
            
            if (options?.extractImages !== undefined) {
                formData.append('extract_images', options.extractImages.toString());
            }
            if (options?.performOcr !== undefined) {
                formData.append('perform_ocr', options.performOcr.toString());
            }

            const batchHeaders: Record<string, string> = {};
            if (this.secret) {
                batchHeaders['X-API-Key'] = this.secret;
            }

            const response = await fetch(`${this.baseUrl}/api/ingest/batch`, {
                method: 'POST',
                headers: batchHeaders,
                body: formData,
                signal: AbortSignal.timeout(300000), // 5 minutes for batch processing
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`AI Engine responded with ${response.status}: ${errorText}`);
            }

            const data = await response.json() as BatchUploadResponse;
            return data;
        } catch (error) {
            logger.error('AI Engine batch ingest failed:', error);
            throw error;
        }
    }

    /**
     * Upload a ZIP file containing course materials
     * The ZIP will be extracted and all supported documents processed
     */
    async ingestZip(
        zipPath: string,
        zipName: string,
        courseId: string,
        options?: {
            extractImages?: boolean;
            performOcr?: boolean;
        }
    ): Promise<BatchUploadResponse> {
        return this.ingestBatch(
            [{ path: zipPath, name: zipName }],
            courseId,
            options
        );
    }

    /**
     * Get content type for a file based on extension
     */
    private getContentType(filename: string): string {
        const ext = filename.toLowerCase().split('.').pop();
        const contentTypes: Record<string, string> = {
            'pdf': 'application/pdf',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'md': 'text/markdown',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'zip': 'application/zip',
        };
        return contentTypes[ext || ''] || 'application/octet-stream';
    }

    /**
     * Analyze chat for intervention needs
     */
    async analyzeIntervention(
        request: InterventionRequest
    ): Promise<InterventionResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/intervention/analyze`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as InterventionResponse;
        } catch (error) {
            logger.error('AI Engine intervention analysis failed:', error);
            return {
                success: false,
                should_intervene: false,
                message: '',
                intervention_type: 'error',
                confidence: 0,
                reason: error instanceof Error ? error.message : 'Unknown error',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Generate discussion summary
     */
    async generateSummary(
        messages: Array<{ sender: string; content: string; timestamp?: string }>,
        chatRoomId: string
    ): Promise<SummaryResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/intervention/summary`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    messages,
                    chat_room_id: chatRoomId,
                    include_action_items: true,
                }),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as SummaryResponse;
        } catch (error) {
            logger.error('AI Engine summary generation failed:', error);
            return {
                success: false,
                summary: '',
                message_count: messages.length,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Generate discussion prompt
     */
    async generatePrompt(
        topic: string,
        context?: string,
        difficulty: 'easy' | 'medium' | 'hard' = 'medium'
    ): Promise<{ success: boolean; prompt: string; error?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/api/intervention/prompt`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    topic,
                    context,
                    difficulty,
                }),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as { success: boolean; prompt: string; error?: string };
        } catch (error) {
            logger.error('AI Engine prompt generation failed:', error);
            return {
                success: false,
                prompt: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async personalChatStream(
        message: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        userName?: string
    ): Promise<globalThis.Response> {
        return fetch(`${this.baseUrl}/api/chat/personal/stream`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                message,
                history: history.slice(-20),
                user_name: userName,
            }),
            signal: AbortSignal.timeout(this.timeout),
        });
    }

    async personalChat(
        message: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        userName?: string
    ): Promise<{ reply: string; success: boolean; tokens_used: number; error?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat/personal`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    message,
                    history: history.slice(-20),
                    user_name: userName,
                }),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as { reply: string; success: boolean; tokens_used: number; error?: string };
        } catch (error) {
            logger.error('AI Engine personal chat failed:', error);
            return {
                reply: 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.',
                success: false,
                tokens_used: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // ============== Orchestration Methods (Teacher-AI Complementarity) ==============

    /**
     * Send message through orchestrated pipeline with full analytics.
     * This is the main method for chat processing with:
     * - NLP engagement analysis
     * - Policy-based RAG (FETCH/NO_FETCH optimization)
     * - Automatic intervention triggers
     * - Process Mining event logging
     */
    async orchestratedChat(
        request: OrchestrationRequest
    ): Promise<OrchestrationResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as OrchestrationResponse;
        } catch (error) {
            logger.error('AI Engine orchestrated chat failed:', error);
            return {
                success: false,
                bot_response: 'Maaf, terjadi kesalahan sistem.',
                action_taken: 'ERROR',
                should_notify_teacher: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Get aggregated analytics for a group's discussion.
     * Returns quality scores, engagement distribution, recommendations.
     */
    async getGroupAnalytics(groupId: string): Promise<GroupAnalyticsResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/analytics/group/${groupId}`, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as GroupAnalyticsResponse;
        } catch (error) {
            logger.error('AI Engine group analytics failed:', error);
            return {
                success: false,
                group_id: groupId,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Analyze a single text for engagement metrics.
     * Returns lexical variety, HOT detection, engagement classification.
     */
    async analyzeEngagement(text: string): Promise<EngagementAnalysisResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/analytics/engagement`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ text }),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as EngagementAnalysisResponse;
        } catch (error) {
            logger.error('AI Engine engagement analysis failed:', error);
            return {
                success: false,
                lexical_variety: 0,
                engagement_type: 'unknown',
                is_higher_order: false,
                hot_indicators: [],
                word_count: 0,
                unique_words: 0,
                confidence: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Export event logs for Educational Process Mining.
     * Returns URL to download CSV compatible with ProM/Disco.
     */
    async exportProcessMiningData(): Promise<ProcessMiningExportResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/api/analytics/export`, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`AI Engine responded with ${response.status}`);
            }

            return await response.json() as ProcessMiningExportResponse;
        } catch (error) {
            logger.error('AI Engine process mining export failed:', error);
            return {
                success: false,
                file_url: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}

// Singleton instance
export const aiEngineService = new AIEngineService();

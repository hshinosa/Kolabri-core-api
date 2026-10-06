/**
 * AI Engine Service
 * 
 * Handles communication with the AI Engine (FastAPI) service.
 * Provides RAG queries, document ingestion, and chat interventions.
 */

import fs from 'fs/promises';
import { Blob } from 'node:buffer';
import { logger } from '../utils/logger.js';
import { aiEngineCircuitBreaker, withRetry, isRetryableError } from '../utils/circuitBreaker.js';
import { sanitizeErrorForLog } from '../utils/sensitiveData.js';

const LLM_TIMEOUT = 30000;
const INGEST_TIMEOUT = 60000;
const BATCH_INGEST_TIMEOUT = 120000;
const ANALYTICS_TIMEOUT = 15000;
const INTERVENTION_TIMEOUT = 20000;
const HEALTH_TIMEOUT = 5000;
const STREAM_TIMEOUT = 120000; // harus > cold-start reranker (~45s) + LLM pertama
const DELETE_TIMEOUT = 10000;

// Types
interface AskResponse {
    answer: string;
    success: boolean;
    error?: string;
}

export interface ProviderContextV1 {
    version: '1.0';
    provider: {
        name: string;
        displayName: string;
    };
    execution: {
        baseUrl: string;
        model: string;
        temperature?: number;
        maxTokens?: number;
    };
    auth: {
        type: 'api-key' | 'bearer';
        credential: string;
    };
    metadata: {
        featureFamily: string;
        requestId: string;
        resolvedAt: string;
    };
}

interface GuardrailPolicyPayload {
    preset: 'strict' | 'balanced' | 'relaxed';
    allow_rewrite: boolean;
    allow_flag_only: boolean;
}

interface ScaffoldingPolicyPayload {
    scaffolding_level?: 'early' | 'late' | 'auto';
    enabled?: boolean;
}

interface ReadingRecommendationItem {
    source_title: string;
    snippet: string;
    rationale: string;
    suggested_action: string;
    page?: number;
    relevance_score: number;
}

interface ReadingRecommendationResponse {
    success: boolean;
    recommendations: ReadingRecommendationItem[];
    fallback: {
        message: string;
        suggestedNextStep: string;
    } | null;
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
    batch_id?: string;
    results?: BatchDocumentResult[];
    documents?: Array<{
        filename?: string;
        name?: string;
        status?: string;
        success?: boolean;
        error?: string | null;
        chunks_created?: number;
    }>;
    stats?: DocumentProcessingStats;
    total_files?: number;
    successful_files?: number;
    failed_files?: number;
    total_chunks?: number;
}

interface FileBufferResult {
    name: string;
    buffer: Buffer;
    contentType: string;
}

interface InterventionRequest {
    provider_context?: ProviderContextV1;
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
    provider_context?: ProviderContextV1;
    user_id: string;
    group_id: string;
    message: string;
    topic?: string;
    collection_name?: string;
    course_id?: string;
    chat_room_id?: string;
    guardrail_policy?: GuardrailPolicyPayload;
    scaffolding_config?: ScaffoldingPolicyPayload;
    session_week_index?: number;
    max_week_index?: number;
    week_context?: Record<string, unknown>;
    chat_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export type CitationPayload = {
    course_material_id: string;
    label?: string;
    page?: number;
};

export interface OrchestrationResponse {
    success: boolean;
    bot_response: string;
    system_intervention?: string;
    intervention_type?: string;
    action_taken: string;
    should_notify_teacher: boolean;
    quality_score?: number;
    meta?: GroupAnalyticsMeta;
    guardrail_outcome?: string;
    guardrail_reason?: string;
    scaffolding_level?: string;
    scaffolding_outcome?: string;
    error?: string;
    citations?: CitationPayload[];
}

export interface StreamEvent {
    type: 'token' | 'full' | 'done' | 'error';
    content?: string;
    sources?: Array<Record<string, unknown>>;
    citations?: CitationPayload[];
    outcome?: string;
    reason?: string;
    scaffolding_triggered?: boolean;
    grounding_ratio?: number;
    analytics?: Record<string, unknown>;
    intervention?: string;
    intervention_type?: string;
    quality_score?: number;
    should_notify_teacher?: boolean;
    guardrail_outcome?: string;
    guardrail_reason?: string;
    scaffolding_level?: string;
    scaffolding_outcome?: string;
}

interface GroupAnalyticsMeta {
    message_count: number;
    hot_percentage: number;
    lexical_variety_avg: number;
    engagement_distribution: Record<string, number>;
    participants: string[];
    last_intervention_time?: string;
    // BUG-06: Engagement fields from orchestration analytics
    engagement_type?: string;
    is_higher_order?: boolean;
    lexical_variety?: number;
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


export interface EngagementAnalysisResponse {
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

export interface ProcessMiningExportResponse {
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

    constructor() {
        this.baseUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
        this.secret = process.env.AI_ENGINE_SECRET || '';
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

    private async resilient<T>(fn: () => Promise<T>, retryable = true, options: { bypassCircuit?: boolean } = {}): Promise<T> {
        return aiEngineCircuitBreaker.execute(
            () => (retryable ? withRetry(fn, 3, isRetryableError) : fn()),
            { bypassCircuit: options.bypassCircuit },
        );
    }

    /**
     * Klasifikasi fase SRL Zimmerman untuk pesan diskusi biasa (non-@ai).
     * Dipanggil fire-and-forget dari socket — kegagalan tidak boleh
     * memengaruhi pengiriman chat. Klasifikasi + logging (bila ada sinyal)
     * dilakukan ai-engine di POST /api/srl/classify.
     */
    async classifySrl(payload: {
        message: string;
        group_id: string;
        chat_room_id: string;
        user_id: string;
        topic?: string;
    }): Promise<void> {
        try {
            await this.fetchWithTimeout(
                `${this.baseUrl}/api/srl/classify`,
                {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(payload),
                },
                ANALYTICS_TIMEOUT
            );
        } catch (error) {
            logger.debug('SRL classification skipped:', sanitizeErrorForLog(error));
        }
    }

    private async fetchWithTimeout(
        url: string,
        options: RequestInit,
        timeoutMs: number
    ): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal,
            });
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError' && controller.signal.aborted) {
                const timeoutError = new Error('AI Engine request timed out');
                timeoutError.name = 'TimeoutError';
                throw timeoutError;
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    /**
     * Check if AI Engine is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            const response = await this.resilient(
                () => this.fetchWithTimeout(
                    `${this.baseUrl}/api/health`,
                    {
                        method: 'GET',
                        headers: this.getHeaders(),
                    },
                    HEALTH_TIMEOUT
                ),
                false,
                { bypassCircuit: true },
            );

            if (response.ok) {
                const data = await response.json() as HealthResponse;
                return data.status === 'healthy' || data.status === 'degraded';
            }
            return false;
        } catch (error) {
            logger.warn('AI Engine health check failed:', sanitizeErrorForLog(error));
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
        sessionDiscussionId?: string,
        guardrailPolicy?: GuardrailPolicyPayload,
        providerContext?: ProviderContextV1,
    ): Promise<AskResponse> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/ask`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        query,
                        course_id: courseId,
                        user_name: userName,
                        session_discussion_id: sessionDiscussionId,
                        guardrail_policy: guardrailPolicy,
                        provider_context: providerContext,
                    }),
                }, LLM_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as AskResponse;
            });
        } catch (error) {
            logger.error('AI Engine ask failed:', sanitizeErrorForLog(error));
            return {
                answer: 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async generateReadingRecommendations(
        topic: string,
        courseId: string,
        limit = 3,
        providerContext?: ProviderContextV1,
    ): Promise<ReadingRecommendationResponse> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/reading-recommendations`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        topic,
                        course_id: courseId,
                        limit,
                        provider_context: providerContext,
                    }),
                }, LLM_TIMEOUT);

                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as ReadingRecommendationResponse;
            });
        } catch (error) {
            logger.error('AI Engine reading recommendation failed:', sanitizeErrorForLog(error));
            return {
                success: false,
                recommendations: [],
                fallback: {
                    message: 'Belum ada materi relevan yang siap direkomendasikan untuk topik ini.',
                    suggestedNextStep: 'Persempit topik atau minta dosen mengunggah materi tambahan ke knowledge base course ini.',
                },
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
        fileName: string,
        extraMetadata?: Record<string, string | number>,
        ingestOptions?: { extractImages?: boolean; performOcr?: boolean }
    ): Promise<IngestResponse> {
        try {
            const fileBuffer = await fs.readFile(filePath);

            return await this.resilient(async () => {
                const formData = new FormData();
                const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
                formData.append('file', fileBlob, fileName);
                formData.append('course_id', courseId);
                formData.append('file_id', fileId);
                const metaPayload: Record<string, unknown> = { ...(extraMetadata ?? {}) };
                if (ingestOptions?.extractImages) {
                    metaPayload.extract_images = true;
                }
                if (ingestOptions?.performOcr) {
                    metaPayload.perform_ocr = true;
                }
                if (Object.keys(metaPayload).length > 0) {
                    formData.append('extra_metadata', JSON.stringify(metaPayload));
                }
                if (ingestOptions?.extractImages !== undefined) {
                    formData.append('extract_images', String(ingestOptions.extractImages));
                }
                if (ingestOptions?.performOcr !== undefined) {
                    formData.append('perform_ocr', String(ingestOptions.performOcr));
                }

                const headers: Record<string, string> = {};
                if (this.secret) {
                    headers['Authorization'] = `Bearer ${this.secret}`;
                }

                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/ingest`, {
                    method: 'POST',
                    headers,
                    body: formData,
                }, INGEST_TIMEOUT);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`AI Engine responded with ${response.status}: ${errorText}`);
                }

                return await response.json() as IngestResponse;
            });
        } catch (error) {
            logger.error('AI Engine ingest failed:', sanitizeErrorForLog(error));
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
            return await this.resilient(async () => {
                const url = new URL(`${this.baseUrl}/api/documents/${documentId}`);
                if (collectionName) {
                    url.searchParams.append('collection_name', collectionName);
                }
                const response = await this.fetchWithTimeout(url.toString(), {
                    method: 'DELETE',
                    headers: this.getHeaders(),
                }, DELETE_TIMEOUT);
                return response.ok;
            });
        } catch (error) {
            logger.error('AI Engine delete document failed:', sanitizeErrorForLog(error));
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
            const fileBufferResults = await Promise.allSettled(
                files.map(async (file) => ({
                    name: file.name,
                    buffer: await fs.readFile(file.path),
                    contentType: this.getContentType(file.name),
                }))
            );

            const readableFiles: FileBufferResult[] = [];
            const unreadableResults: BatchDocumentResult[] = [];

            fileBufferResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    readableFiles.push(result.value);
                    return;
                }

                const failedFile = files[index];
                unreadableResults.push({
                    filename: failedFile?.name ?? `file-${index + 1}`,
                    status: 'error',
                    error: result.reason instanceof Error ? result.reason.message : 'Failed to read file',
                });
            });

            if (readableFiles.length === 0) {
                return {
                    success: false,
                    message: 'No readable files available for batch ingest',
                    processing_time_ms: 0,
                    results: unreadableResults,
                    total_files: files.length,
                    successful_files: 0,
                    failed_files: unreadableResults.length,
                    total_chunks: 0,
                };
            }

            const aiResponse = await this.resilient(async () => {
                const formData = new FormData();

                for (const { name, buffer, contentType } of readableFiles) {
                    const blob = new Blob([buffer], { type: contentType });
                    formData.append('files', blob, name);
                }

                formData.append('course_id', courseId);
                if (options?.extractImages !== undefined) {
                    formData.append('extract_images', options.extractImages.toString());
                }
                if (options?.performOcr !== undefined) {
                    formData.append('perform_ocr', options.performOcr.toString());
                }

                const batchHeaders: Record<string, string> = {};
                if (this.secret) {
                    batchHeaders['Authorization'] = `Bearer ${this.secret}`;
                }

                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/ingest/batch`, {
                    method: 'POST',
                    headers: batchHeaders,
                    body: formData,
                }, BATCH_INGEST_TIMEOUT);

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`AI Engine responded with ${response.status}: ${errorText}`);
                }

                return await response.json() as BatchUploadResponse;
            });

            if (unreadableResults.length === 0) {
                return aiResponse;
            }

            const mergedResults = [...(aiResponse.results ?? []), ...unreadableResults];
            const aiSuccessCount = aiResponse.successful_files ?? aiResponse.results?.filter((result) => result.status === 'success').length ?? 0;
            const aiFailedCount = aiResponse.failed_files ?? aiResponse.results?.filter((result) => result.status === 'error').length ?? 0;
            const aiTotalFiles = aiResponse.total_files ?? readableFiles.length;

            return {
                ...aiResponse,
                success: aiResponse.success && aiSuccessCount > 0,
                message: unreadableResults.length > 0
                    ? `${aiResponse.message} (${unreadableResults.length} file(s) could not be read locally)`
                    : aiResponse.message,
                results: mergedResults,
                total_files: aiTotalFiles + unreadableResults.length,
                successful_files: aiSuccessCount,
                failed_files: aiFailedCount + unreadableResults.length,
            };
        } catch (error) {
            logger.error('AI Engine batch ingest failed:', sanitizeErrorForLog(error));
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
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/intervention/analyze`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify(request),
                }, INTERVENTION_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as InterventionResponse;
            });
        } catch (error) {
            logger.error('AI Engine intervention analysis failed:', sanitizeErrorForLog(error));
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
        chatRoomId: string,
        providerContext?: ProviderContextV1,
    ): Promise<SummaryResponse> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/intervention/summary`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        messages,
                        chat_room_id: chatRoomId,
                        include_action_items: true,
                        provider_context: providerContext,
                    }),
                }, INTERVENTION_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as SummaryResponse;
            });
        } catch (error) {
            logger.error('AI Engine summary generation failed:', sanitizeErrorForLog(error));
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
        difficulty: 'easy' | 'medium' | 'hard' = 'medium',
        providerContext?: ProviderContextV1,
    ): Promise<{ success: boolean; prompt: string; error?: string }> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/intervention/prompt`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ topic, context, difficulty, provider_context: providerContext }),
                }, INTERVENTION_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as { success: boolean; prompt: string; error?: string };
            });
        } catch (error) {
            logger.error('AI Engine prompt generation failed:', sanitizeErrorForLog(error));
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
        userName?: string,
        providerContext?: ProviderContextV1,
        courseIds: string[] = [],
    ): Promise<globalThis.Response> {
        return await this.resilient(() => this.fetchWithTimeout(
            `${this.baseUrl}/api/chat/personal/stream`,
            {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    message,
                    history: history.slice(-20),
                    user_name: userName,
                    provider_context: providerContext,
                    course_ids: courseIds,
                }),
            },
            LLM_TIMEOUT
        ));
    }

    // ============== Orchestration Methods (Teacher-AI Complementarity) ==============

    /**
     * Stream orchestrated chat via SSE (PERF-AI-01).
     * Consumes POST /api/chat/stream from AI Engine, parses SSE events.
     * NO_FETCH path streams tokens; FETCH path returns full result.
     * Yields StreamEvent objects to caller (socket handler).
     */
    async *orchestratedChatStream(request: OrchestrationRequest): AsyncGenerator<StreamEvent> {
        try {
            // Headers stream bisa tertahan sampai engine selesai warm-up reranker
            // (~45 detik setelah restart) — LLM_TIMEOUT 30s membatalkan @ai
            // pertama pasca-restart (bug E2E 2026-10-06: citations kosong).
            const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/stream`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(request),
            }, STREAM_TIMEOUT);

            if (!response.ok) {
                throw new Error(`AI Engine stream responded with ${response.status}`);
            }
            if (!response.body) {
                throw new Error('AI Engine stream returned no body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ')) continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') return;
                    try {
                        yield JSON.parse(data) as StreamEvent;
                    } catch {
                        // Skip malformed SSE lines
                    }
                }
            }
        } catch (error) {
            logger.error('AI Engine orchestrated chat stream failed:', sanitizeErrorForLog(error));
            yield { type: 'error', content: 'Maaf, terjadi kesalahan sistem.' };
        }
    }

    /**
     * Get aggregated analytics for a group's discussion.
     * Returns quality scores, engagement distribution, recommendations.
     */
    async getGroupAnalytics(groupId: string): Promise<GroupAnalyticsResponse> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/analytics/group/${groupId}`, {
                    method: 'GET',
                    headers: this.getHeaders(),
                }, ANALYTICS_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as GroupAnalyticsResponse;
            });
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
    async analyzeEngagement(text: string, providerContext?: ProviderContextV1): Promise<EngagementAnalysisResponse> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/analytics/engagement`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ text, provider_context: providerContext }),
                }, ANALYTICS_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as EngagementAnalysisResponse;
            });
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
    async exportProcessMiningData(providerContext?: ProviderContextV1): Promise<ProcessMiningExportResponse> {
        try {
            return await this.resilient(async () => {
                const url = new URL(`${this.baseUrl}/api/analytics/export`);
                if (providerContext) {
                    url.searchParams.append('provider_context', JSON.stringify(providerContext));
                }
                const response = await this.fetchWithTimeout(url.toString(), {
                    method: 'GET',
                    headers: this.getHeaders(),
                }, ANALYTICS_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as ProcessMiningExportResponse;
            });
        } catch (error) {
            logger.error('AI Engine process mining export failed:', error);
            return {
                success: false,
                file_url: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async refineGoal(
        currentGoal: string,
        missingCriteria: string[],
        providerContext?: ProviderContextV1,
    ): Promise<{ success: boolean; refined_goal?: string; error?: string }> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/goals/refine`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ current_goal: currentGoal, missing_criteria: missingCriteria, provider_context: providerContext }),
                }, ANALYTICS_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as { success: boolean; refined_goal: string };
            });
        } catch (error) {
            logger.error('AI Engine goal refinement failed:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    async trackActivity(groupId: string, userId?: string): Promise<void> {
        try {
            await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/track-activity`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({ group_id: groupId, user_id: userId }),
                }, 3000);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return response;
            }, true);
        } catch (error) {
            logger.debug('AI Engine track activity failed (non-critical)', {
                groupId,
                userId,
                error: error instanceof Error ? error.message : 'Unknown error',
                label: 'retry_failed',
            });
        }
    }

    async validateGoal(
        goalText: string,
        userId: string,
        sessionDiscussionId: string,
        weekContext?: { week_title?: string; week_index?: number; material_titles?: string[] },
        providerContext?: ProviderContextV1,
        groupId?: string,
    ): Promise<{ success: boolean; is_valid: boolean; score: number; feedback: string; socratic_hint?: string; missing_criteria?: string[]; status?: 'accepted' | 'revise'; error?: string }> {
        try {
            return await this.resilient(async () => {
                const response = await this.fetchWithTimeout(`${this.baseUrl}/api/goals/validate`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        goal_text: goalText,
                        user_id: userId,
                        session_discussion_id: sessionDiscussionId,
                        week_context: weekContext ?? undefined,
                        provider_context: providerContext,
                        group_id: groupId,
                    }),
                }, LLM_TIMEOUT);
                if (!response.ok) throw new Error(`AI Engine responded with ${response.status}`);
                return await response.json() as { success: boolean; is_valid: boolean; score: number; feedback: string; socratic_hint?: string; missing_criteria?: string[] };
            });
        } catch (error) {
            logger.error('AI Engine goal validation failed:', error);
            return { success: false, is_valid: true, score: 0, feedback: '', error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
}

// Singleton instance
export const aiEngineService = new AIEngineService();

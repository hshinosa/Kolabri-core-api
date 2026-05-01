import { GoogleGenerativeAI } from '@google/generative-ai';

import { BaseAIProviderAdapter, type AIProviderResponse, type AIProviderSendConfig } from './base-adapter.js';

const GEMINI_PRICING = {
    prompt: 0.00025,
    completion: 0.0005,
};

export class GeminiAdapter extends BaseAIProviderAdapter {
    async sendMessage(prompt: string, config: AIProviderSendConfig): Promise<AIProviderResponse> {
        const client = new GoogleGenerativeAI(this.apiKey);
        const model = client.getGenerativeModel({
            model: config.model,
            generationConfig: {
                temperature: config.temperature,
                maxOutputTokens: config.maxTokens,
            },
            systemInstruction: config.systemPrompt,
        });

        const startedAt = Date.now();
        const result = await model.generateContent(this.buildTextPrompt(prompt, config.history, config.systemPrompt));
        const response = result.response;
        const usage = response.usageMetadata;

        return {
            content: response.text(),
            promptTokens: usage?.promptTokenCount ?? 0,
            completionTokens: usage?.candidatesTokenCount ?? 0,
            totalTokens: usage?.totalTokenCount ?? 0,
            model: config.model,
            latencyMs: Date.now() - startedAt,
        };
    }

    estimateCost(promptTokens: number, completionTokens: number): number {
        return Number((((promptTokens / 1000) * GEMINI_PRICING.prompt) + ((completionTokens / 1000) * GEMINI_PRICING.completion)).toFixed(6));
    }
}

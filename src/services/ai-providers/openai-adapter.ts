import OpenAI from 'openai';

import { BaseAIProviderAdapter, type AIProviderResponse, type AIProviderSendConfig } from './base-adapter.js';

const OPENAI_PRICING: Record<string, { prompt: number; completion: number }> = {
    'gpt-4': { prompt: 0.03, completion: 0.06 },
    'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
    'gpt-3.5-turbo': { prompt: 0.0005, completion: 0.0015 },
};

export class OpenAIAdapter extends BaseAIProviderAdapter {
    async sendMessage(prompt: string, config: AIProviderSendConfig): Promise<AIProviderResponse> {
        const client = new OpenAI({
            apiKey: this.apiKey,
            baseURL: config.baseUrl || undefined,
        });

        const startedAt = Date.now();
        const completion = await client.chat.completions.create({
            model: config.model,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            messages: [
                ...(config.systemPrompt ? [{ role: 'system' as const, content: config.systemPrompt }] : []),
                ...((config.history ?? []).map((item) => ({ role: item.role, content: item.content }))),
                { role: 'user', content: prompt },
            ],
        });

        return {
            content: completion.choices[0]?.message?.content ?? '',
            promptTokens: completion.usage?.prompt_tokens ?? 0,
            completionTokens: completion.usage?.completion_tokens ?? 0,
            totalTokens: completion.usage?.total_tokens ?? 0,
            model: completion.model,
            latencyMs: Date.now() - startedAt,
        };
    }

    estimateCost(promptTokens: number, completionTokens: number): number {
        const pricing = OPENAI_PRICING['gpt-4'];
        return Number((((promptTokens / 1000) * pricing.prompt) + ((completionTokens / 1000) * pricing.completion)).toFixed(6));
    }
}

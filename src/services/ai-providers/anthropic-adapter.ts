import Anthropic from '@anthropic-ai/sdk';

import { BaseAIProviderAdapter, type AIProviderResponse, type AIProviderSendConfig } from './base-adapter.js';

const CLAUDE_PRICING = {
    prompt: 0.015,
    completion: 0.075,
};

export class AnthropicAdapter extends BaseAIProviderAdapter {
    async sendMessage(prompt: string, config: AIProviderSendConfig): Promise<AIProviderResponse> {
        const client = new Anthropic({
            apiKey: this.apiKey,
            baseURL: config.baseUrl || undefined,
        });

        const startedAt = Date.now();
        const message = await client.messages.create({
            model: config.model,
            max_tokens: config.maxTokens ?? 1024,
            temperature: config.temperature,
            system: config.systemPrompt,
            messages: [
                ...((config.history ?? []).map((item) => ({ role: item.role, content: item.content }))),
                { role: 'user', content: prompt },
            ],
        });

        const textContent = message.content
            .filter((item): item is Extract<(typeof message.content)[number], { type: 'text' }> => item.type === 'text')
            .map((item) => item.text)
            .join('\n');

        return {
            content: textContent,
            promptTokens: message.usage.input_tokens,
            completionTokens: message.usage.output_tokens,
            totalTokens: message.usage.input_tokens + message.usage.output_tokens,
            model: message.model,
            latencyMs: Date.now() - startedAt,
        };
    }

    estimateCost(promptTokens: number, completionTokens: number): number {
        return Number((((promptTokens / 1000) * CLAUDE_PRICING.prompt) + ((completionTokens / 1000) * CLAUDE_PRICING.completion)).toFixed(6));
    }
}

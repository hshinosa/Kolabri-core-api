export interface AIProviderSendConfig {
    model: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    baseUrl?: string | null;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AIProviderResponse {
    content: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    latencyMs: number;
}

export interface AIProviderAdapter {
    sendMessage(prompt: string, config: AIProviderSendConfig): Promise<AIProviderResponse>;
    estimateCost(promptTokens: number, completionTokens: number): number;
}

export abstract class BaseAIProviderAdapter implements AIProviderAdapter {
    constructor(protected readonly apiKey: string) {}

    abstract sendMessage(prompt: string, config: AIProviderSendConfig): Promise<AIProviderResponse>;

    abstract estimateCost(promptTokens: number, completionTokens: number): number;

    protected buildTextPrompt(prompt: string, history: AIProviderSendConfig['history'], systemPrompt?: string) {
        const sections: string[] = [];

        if (systemPrompt) {
            sections.push(`System: ${systemPrompt}`);
        }

        if (history && history.length > 0) {
            sections.push(
                history
                    .map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`)
                    .join('\n')
            );
        }

        sections.push(`User: ${prompt}`);

        return sections.filter(Boolean).join('\n\n');
    }
}

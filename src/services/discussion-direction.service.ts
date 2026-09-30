 import { aiEngineCircuitBreaker } from '../utils/circuitBreaker.js';
import { aiEngineService } from './aiEngine.service.js';
import type { ProviderContextV1 } from './aiEngine.service.js';

export class DiscussionDirectionService {
  static async classifyMessages(
    messages: Array<{ id: string; content: string }>,
    goal: string
  ): Promise<Array<{ messageId: string; isRelevant: boolean }>> {
    try {
      const result = await aiEngineCircuitBreaker.execute(async () => {
        const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
        const secret = process.env.AI_ENGINE_SECRET || '';
        const response = await fetch(`${aiEngineUrl}/api/classify-relevance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify({ messages, goal, provider_context: undefined }),
        });
        if (!response.ok) {
          throw new Error(`AI Engine returned ${response.status}`);
        }
        const data = (await response.json()) as { classifications?: Array<{ messageId: string; isRelevant: boolean }> };
        return data.classifications || messages.map((m) => ({ messageId: m.id, isRelevant: true }));
      });
      return result;
    } catch (error) {
      console.error('Discussion direction classification error:', error);
      return messages.map((m) => ({ messageId: m.id, isRelevant: true }));
    }
  }

  static async generateSessionSummary(
    messages: Array<{ content: string; senderName: string }>,
    goal: string,
    stats: { totalMessages: number; participantCount: number }
  ): Promise<{
    goalAchieved: boolean;
    topics: string[];
    contributions: Record<string, number>;
    assessment: string;
  }> {
    try {
      const result = await aiEngineCircuitBreaker.execute(async () => {
        const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8001';
        const secret = process.env.AI_ENGINE_SECRET || '';
        const response = await fetch(`${aiEngineUrl}/api/session-summary`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
          },
          body: JSON.stringify({ messages, goal, stats, provider_context: undefined }),
        });
        if (!response.ok) {
          throw new Error(`AI Engine returned ${response.status}`);
        }
        return (await response.json()) as {
          goalAchieved: boolean;
          topics: string[];
          contributions: Record<string, number>;
          assessment: string;
        };
      });
      return result;
    } catch (error) {
      console.error('Discussion direction summary generation error:', error);
      return this.defaultSummary(goal, stats);
    }
  }

  /**
   * Default summary fallback when AI Engine is unavailable
   * @param goal Session learning goal
   * @param stats Session statistics
   * @returns Default summary structure
   */
  private static defaultSummary(
    goal: string,
    stats: { totalMessages: number; participantCount: number }
  ) {
    return {
      goalAchieved: false,
      topics: goal ? [goal] : [],
      contributions: {},
      assessment:
        `Penilaian tujuan tidak tersedia saat ini (layanan AI sibuk atau tidak merespons). ` +
        `Sesi ini mencatat ${stats.totalMessages} pesan dari ${stats.participantCount} peserta. ` +
        `Silakan tinjau kembali tujuan: "${goal}".`,
    };
  }

  /**
   * Compute discussion health score
   * @param relevanceRatio Ratio of relevant messages (0-1)
   * @param participationBalance Participation balance from Shannon entropy (0-1)
   * @param goalProgress Goal progress ratio (0-1)
   * @returns Health score (0-100)
   */
  static computeHealthScore(
    relevanceRatio: number,
    participationBalance: number,
    goalProgress: number
  ): number {
    // Weighted score: 40% relevance, 30% participation balance, 30% goal progress
    const score =
      relevanceRatio * 0.4 + participationBalance * 0.3 + goalProgress * 0.3;
    return Math.round(score * 100);
  }

  /**
   * Calculate Shannon entropy for participation balance
   * Higher entropy = more balanced participation
   * @param contributions Map of sender to message count
   * @returns Normalized entropy score (0-1, 1 = perfectly balanced)
   */
  static shannonEntropy(contributions: Record<string, number>): number {
    const total = Object.values(contributions).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    const n = Object.keys(contributions).length;
    if (n <= 1) return 1;

    let entropy = 0;
    for (const count of Object.values(contributions)) {
      const p = count / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }

    // Normalize by max entropy (log2(n))
    const maxEntropy = Math.log2(n);
    return maxEntropy === 0 ? 1 : entropy / maxEntropy;
  }
}

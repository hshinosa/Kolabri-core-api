// HOT (Higher-Order Thinking) detection keywords
const HOT_KEYWORDS = [
    'mengapa', 'kenapa', 'bagaimana', 'analisis', 'evaluasi', 'bandingkan',
    'jelaskan', 'argumentasi', 'kritik', 'sintesis', 'hubungkan', 'simpulkan',
    'why', 'how', 'analyze', 'evaluate', 'compare', 'explain', 'argue',
    'menurut saya', 'pendapat saya', 'alasannya', 'karena', 'sebab',
    'dampak', 'pengaruh', 'akibat', 'solusi', 'alternatif'
];

const COGNITIVE_KEYWORDS = [
    'mengapa', 'bagaimana', 'analisis', 'evaluasi', 'bandingkan', 'jelaskan',
    'menurut saya', 'pendapat', 'alasan', 'karena', 'sebab', 'konsep',
    'teori', 'hipotesis', 'kesimpulan', 'bukti', 'argumen'
];

const BEHAVIORAL_KEYWORDS = [
    'saya akan', 'mari kita', 'ayo', 'sudah selesai', 'bisa bantu',
    'saya coba', 'sudah dikerjakan', 'progress', 'tugas', 'deadline',
    'submit', 'kirim', 'upload', 'download', 'share', 'bagikan'
];

const EMOTIONAL_KEYWORDS = [
    'bagus', 'keren', 'mantap', 'semangat', 'setuju', 'terima kasih',
    'thanks', 'maaf', 'sorry', 'senang', 'susah', 'sulit', 'mudah',
    'bingung', 'paham', 'mengerti', 'jelas', 'tidak jelas'
];

export interface EngagementAnalysis {
    engagementType: 'cognitive' | 'behavioral' | 'emotional';
    isHigherOrder: boolean;
    lexicalVariety: number;
    hotIndicators: string[];
    confidence: number;
}

export function analyzeEngagement(text: string): EngagementAnalysis {
    const lowerText = text.toLowerCase();
    const words = lowerText.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);

    const uniqueWords = new Set(words);
    const lexicalVariety = words.length > 0
        ? Math.round((uniqueWords.size / Math.max(words.length, 1)) * 100)
        : 0;

    const hotIndicators = HOT_KEYWORDS.filter(k => lowerText.includes(k));
    const isHigherOrder = hotIndicators.length > 0;

    const cognitiveScore = COGNITIVE_KEYWORDS.filter(k => lowerText.includes(k)).length;
    const behavioralScore = BEHAVIORAL_KEYWORDS.filter(k => lowerText.includes(k)).length;
    const emotionalScore = EMOTIONAL_KEYWORDS.filter(k => lowerText.includes(k)).length;

    let engagementType: 'cognitive' | 'behavioral' | 'emotional';
    if (cognitiveScore >= behavioralScore && cognitiveScore >= emotionalScore) {
        engagementType = 'cognitive';
    } else if (behavioralScore >= emotionalScore) {
        engagementType = 'behavioral';
    } else {
        engagementType = 'emotional';
    }

    const totalMatches = cognitiveScore + behavioralScore + emotionalScore;
    const confidence = totalMatches > 0 ? Math.min(0.5 + (totalMatches * 0.1), 1.0) : 0.3;

    return {
        engagementType,
        isHigherOrder,
        lexicalVariety,
        hotIndicators,
        confidence,
    };
}

export const QUALITY_THRESHOLDS = {
    LOW_HOT: 20,
    LOW_COGNITIVE: 25,
    LOW_LEXICAL: 25,
};

export type QualityInterventionType = 'low_hot' | 'low_cognitive' | 'low_lexical' | 'general' | null;

export interface QualityMetrics {
    hotPercentage: number;
    cognitiveRatio: number;
    avgLexical: number;
}

export interface QualityDecision {
    interventionType: QualityInterventionType;
    qualityIssue: string;
}

export function decideQualityIntervention(metrics: QualityMetrics): QualityDecision {
    if (metrics.hotPercentage < QUALITY_THRESHOLDS.LOW_HOT) {
        return {
            interventionType: 'low_hot',
            qualityIssue: `HOT thinking: ${metrics.hotPercentage.toFixed(0)}%`,
        };
    }
    if (metrics.cognitiveRatio < QUALITY_THRESHOLDS.LOW_COGNITIVE) {
        return {
            interventionType: 'low_cognitive',
            qualityIssue: `Cognitive engagement: ${metrics.cognitiveRatio.toFixed(0)}%`,
        };
    }
    if (metrics.avgLexical < QUALITY_THRESHOLDS.LOW_LEXICAL) {
        return {
            interventionType: 'low_lexical',
            qualityIssue: `Lexical variety: ${metrics.avgLexical.toFixed(0)}%`,
        };
    }
    return { interventionType: null, qualityIssue: '' };
}

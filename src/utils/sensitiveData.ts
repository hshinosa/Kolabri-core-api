const SECRET_PATTERNS = [
    /("credential"\s*:\s*")([^"]+)(")/gi,
    /("apiKey"\s*:\s*")([^"]+)(")/gi,
    /("api_key"\s*:\s*")([^"]+)(")/gi,
    /("authorization"\s*:\s*")([^"]+)(")/gi,
    /(sk-[a-zA-Z0-9-_]+)/g,
    /(Bearer\s+[A-Za-z0-9._-]+)/gi,
];

export function redactSensitiveText(value: string): string {
    return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, (_, prefix, secret, suffix) => {
        if (typeof suffix === 'string') {
            return `${prefix}[REDACTED]${suffix}`;
        }
        return '[REDACTED]';
    }), value);
}

export function sanitizeErrorForLog(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${redactSensitiveText(error.message)}`;
    }

    return redactSensitiveText(String(error));
}

import { describe, expect, it } from 'vitest';
import { sanitizeMessageContent, sanitizeAttachment, sanitizeAttachments } from './sanitize.js';

describe('sanitizeMessageContent', () => {
    it('strips script tags entirely', () => {
        const out = sanitizeMessageContent('hello<script>alert(1)</script>world');
        expect(out).not.toContain('<script>');
        expect(out).not.toContain('alert(1)');
        expect(out).toContain('hello');
        expect(out).toContain('world');
    });

    it('strips style tags entirely', () => {
        const out = sanitizeMessageContent('<style>body{display:none}</style>hi');
        expect(out).not.toContain('display:none');
        expect(out).toContain('hi');
    });

    it('keeps allowed formatting tags', () => {
        const out = sanitizeMessageContent('<b>bold</b> and <em>em</em>');
        expect(out).toContain('<b>bold</b>');
        expect(out).toContain('<em>em</em>');
    });

    it('strips javascript: URLs from anchor href', () => {
        const out = sanitizeMessageContent('<a href="javascript:alert(1)">x</a>');
        expect(out).not.toContain('javascript:');
    });

    it('keeps https anchor href', () => {
        const out = sanitizeMessageContent('<a href="https://example.com">x</a>');
        expect(out).toContain('href="https://example.com"');
    });

    it('throws when content exceeds 10k chars', () => {
        const big = 'a'.repeat(10_001);
        expect(() => sanitizeMessageContent(big)).toThrow('message_too_long');
    });

    it('returns empty string for non-string input', () => {
        expect(sanitizeMessageContent(undefined as unknown as string)).toBe('');
    });
});

describe('sanitizeAttachment', () => {
    const valid = {
        id: 'a1',
        name: 'doc.pdf',
        type: 'application/pdf',
        size: 1024,
        url: 'https://cdn.example.com/file.pdf',
    };

    it('rejects javascript: urls', () => {
        expect(sanitizeAttachment({ ...valid, url: 'javascript:alert(1)' })).toBeNull();
    });

    it('rejects data: urls', () => {
        expect(sanitizeAttachment({ ...valid, url: 'data:text/html,<script>x</script>' })).toBeNull();
    });

    it('accepts https urls', () => {
        const out = sanitizeAttachment(valid);
        expect(out).not.toBeNull();
        expect(out?.url).toBe(valid.url);
    });

    it('neutralizes path traversal in filename', () => {
        const out = sanitizeAttachment({ ...valid, name: '../../../etc/passwd' });
        expect(out?.name).not.toContain('/');
        expect(out?.name).not.toContain('\\');
    });

    it('rejects oversized files', () => {
        expect(sanitizeAttachment({ ...valid, size: 100 * 1024 * 1024 })).toBeNull();
    });

    it('rejects zero/negative size', () => {
        expect(sanitizeAttachment({ ...valid, size: 0 })).toBeNull();
        expect(sanitizeAttachment({ ...valid, size: -1 })).toBeNull();
    });

    it('drops malicious previewUrl but keeps attachment', () => {
        const out = sanitizeAttachment({ ...valid, previewUrl: 'javascript:alert(1)' });
        expect(out).not.toBeNull();
        expect(out?.previewUrl).toBeUndefined();
    });
});

describe('sanitizeAttachments', () => {
    it('filters out invalid attachments', () => {
        const out = sanitizeAttachments([
            { id: '1', name: 'a', type: 't', size: 100, url: 'https://ok' },
            { id: '2', name: 'b', type: 't', size: 100, url: 'javascript:alert(1)' },
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe('1');
    });

    it('returns [] for non-array', () => {
        expect(sanitizeAttachments(undefined)).toEqual([]);
    });
});

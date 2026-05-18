import xss from 'xss';

const messageXssOptions = {
    whiteList: {
        b: [],
        i: [],
        em: [],
        strong: [],
        code: [],
        pre: [],
        p: [],
        br: [],
        a: ['href'],
    } as Record<string, string[]>,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
    safeAttrValue: (_tag: string, name: string, value: string) => {
        if (name === 'href') {
            if (/^https?:\/\//i.test(value)) return value;
            return '';
        }
        return value;
    },
};

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_ATTACHMENT_NAME = 200;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export function sanitizeMessageContent(content: string): string {
    if (typeof content !== 'string') return '';
    if (content.length > MAX_MESSAGE_LENGTH) {
        throw new Error('message_too_long');
    }
    return xss(content, messageXssOptions);
}

const SAFE_URL_PROTOCOLS = ['http:', 'https:'];

function isSafeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return SAFE_URL_PROTOCOLS.includes(parsed.protocol);
    } catch {
        return false;
    }
}

export interface SocketAttachmentInput {
    id: string;
    name: string;
    type: string;
    size: number;
    url: string;
    previewUrl?: string;
}

export function sanitizeAttachment(meta: SocketAttachmentInput): SocketAttachmentInput | null {
    if (!isSafeUrl(meta.url)) return null;
    if (meta.size <= 0 || meta.size > MAX_ATTACHMENT_BYTES) return null;

    const safeName = meta.name
        .replace(/[<>"'\\/]/g, '_')
        .slice(0, MAX_ATTACHMENT_NAME);

    const safePreviewUrl = meta.previewUrl && isSafeUrl(meta.previewUrl) ? meta.previewUrl : undefined;

    return {
        id: meta.id,
        name: safeName,
        type: meta.type.slice(0, 100),
        size: meta.size,
        url: meta.url,
        previewUrl: safePreviewUrl,
    };
}

export function sanitizeAttachments(meta: SocketAttachmentInput[] | undefined): SocketAttachmentInput[] {
    if (!Array.isArray(meta)) return [];
    return meta
        .map(sanitizeAttachment)
        .filter((a): a is SocketAttachmentInput => a !== null);
}

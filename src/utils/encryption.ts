import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-32-char-key-change-this!'; // Must be 32 bytes
const IV_LENGTH = 16;

export function encrypt(text: string): string {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
    if (!text) return text;

    const parts = text.split(':');

    // Check if text matches encrypted format: hex_iv:hex_ciphertext
    // Encrypted values have exactly 2 parts separated by ':', first part is 32 hex chars (16 bytes IV)
    if (parts.length !== 2 || parts[0].length !== 32 || !/^[0-9a-f]+$/i.test(parts[0])) {
        // Not encrypted — return as-is (plain-text key)
        return text;
    }

    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export function maskApiKey(apiKey: string): string {
    if (!apiKey) return '****';
    if (apiKey.length <= 4) return `****${apiKey}`;
    return `****${apiKey.slice(-4)}`;
}

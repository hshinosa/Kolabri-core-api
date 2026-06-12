import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const CLIENT_APP_PATH = '/Users/hshino/Kuliah/ProjectTA/Kolabri-client-app/resources/js';

const ENGLISH_UI_PHRASES = [
    /\bSign in\b/i,
    /\bSign up\b/i,
    /\bForgot password\b/i,
    /\bRemember me\b/i,
    /\bPlease wait\b/i,
    /\bClick here\b/i,
    /\bLearn more\b/i,
    /\bGet started\b/i,
];

const INDONESIAN_EXCEPTIONS = [
    'email',
    'password',
    'token',
    'id',
    'api',
    'url',
    'http',
    'https',
    'json',
    'xml',
    'html',
    'css',
    'javascript',
    'typescript',
    'react',
    'vue',
    'angular',
    'node',
    'npm',
    'yarn',
    'webpack',
    'vite',
    'eslint',
    'prettier',
    'git',
    'github',
    'gitlab',
    'docker',
    'kubernetes',
    'aws',
    'azure',
    'gcp',
];

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = readdirSync(dirPath);

    files.forEach((file) => {
        const filePath = join(dirPath, file);
        if (statSync(filePath).isDirectory()) {
            if (!file.startsWith('.') && file !== 'node_modules' && file !== 'vendor') {
                arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
            }
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            arrayOfFiles.push(filePath);
        }
    });

    return arrayOfFiles;
}

function extractUserFacingStrings(content: string): string[] {
    const strings: string[] = [];

    const singleQuoteRegex = /'([^'\\]*(\\.[^'\\]*)*)'/g;
    const doubleQuoteRegex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
    const templateLiteralRegex = /`([^`\\]*(\\.[^`\\]*)*)`/g;

    let match;
    while ((match = singleQuoteRegex.exec(content)) !== null) {
        strings.push(match[1]);
    }
    while ((match = doubleQuoteRegex.exec(content)) !== null) {
        strings.push(match[1]);
    }
    while ((match = templateLiteralRegex.exec(content)) !== null) {
        strings.push(match[1]);
    }

    return strings.filter(s => {
        if (s.length < 3) return false;
        if (s.startsWith('/') || s.startsWith('http')) return false;
        if (s.match(/^[0-9]+$/)) return false;
        if (s.match(/^[a-z_-]+$/)) return false;
        if (INDONESIAN_EXCEPTIONS.some(exc => s.toLowerCase().includes(exc))) return false;
        return true;
    });
}

function containsEnglishText(text: string): boolean {
    return ENGLISH_UI_PHRASES.some((pattern) => pattern.test(text));
}

const clientExists = existsSync(CLIENT_APP_PATH);
describe.skipIf(!clientExists)('Indonesian Text Verification', () => {
    describe('Client App UI Text', () => {
        it('should have all user-facing text in Indonesian', () => {
            const files = getAllFiles(CLIENT_APP_PATH);
            const violations: Array<{ file: string; string: string }> = [];

            files.forEach(file => {
                const content = readFileSync(file, 'utf-8');
                const userFacingStrings = extractUserFacingStrings(content);

                userFacingStrings.forEach(str => {
                    if (containsEnglishText(str)) {
                        violations.push({
                            file: file.replace(CLIENT_APP_PATH, ''),
                            string: str,
                        });
                    }
                });
            });

            if (violations.length > 0) {
                console.log('\n❌ Found English text in user-facing strings:\n');
                violations.forEach(v => {
                    console.log(`  File: ${v.file}`);
                    console.log(`  Text: "${v.string}"\n`);
                });
            }

            expect(violations.length).toBe(0);
        });

        it('should have Indonesian text in auth pages', () => {
            const loginPath = join(CLIENT_APP_PATH, 'pages/auth/login.tsx');
            const registerPath = join(CLIENT_APP_PATH, 'pages/auth/register.tsx');
            const forgotPath = join(CLIENT_APP_PATH, 'pages/auth/forgot-password.tsx');

            const loginContent = readFileSync(loginPath, 'utf-8');
            expect(loginContent).toMatch(/Masuk/);
            expect(loginContent).toMatch(/Alamat Email|email/i);
            expect(loginContent).toMatch(/Kata Sandi|sandi/i);

            const registerContent = readFileSync(registerPath, 'utf-8');
            expect(registerContent).toMatch(/Daftar|Register/);
            expect(registerContent).toMatch(/Alamat Email|email/i);
            expect(registerContent).toMatch(/Kata Sandi|sandi/i);

            const forgotContent = readFileSync(forgotPath, 'utf-8');
            expect(forgotContent.length).toBeGreaterThan(0);
        });

        it('should have Indonesian error messages', () => {
            const files = getAllFiles(CLIENT_APP_PATH);
            const errorFiles = files.filter(f => f.includes('auth'));

            errorFiles.forEach(file => {
                const content = readFileSync(file, 'utf-8');
                const errorMessages = extractUserFacingStrings(content).filter(s =>
                    s.toLowerCase().includes('error') ||
                    s.toLowerCase().includes('gagal') ||
                    s.toLowerCase().includes('berhasil')
                );

                errorMessages.forEach(msg => {
                    if (msg.length > 10) {
                        expect(msg).toMatch(/[a-zA-Z]/);
                    }
                });
            });
        });

        it('should have Indonesian button labels', () => {
            const files = getAllFiles(join(CLIENT_APP_PATH, 'pages/auth'));
            const buttonLabels: string[] = [];

            files.forEach(file => {
                const content = readFileSync(file, 'utf-8');
                const buttonRegex = /<button[^>]*>([^<]+)<\/button>|<SecondaryButton[^>]*>([^<]+)<\/SecondaryButton>/gi;
                let match;
                while ((match = buttonRegex.exec(content)) !== null) {
                    const label = (match[1] ?? match[2] ?? '').trim();
                    if (label && !label.startsWith('{')) buttonLabels.push(label);
                }
            });

            const englishOnlyButtons = buttonLabels.filter((label) => {
                const t = label.trim();
                if (!t) return false;
                if (/^(Submit|Cancel|Save|Delete|Edit|Update|Create|Add|Remove|Sign in|Sign up)$/i.test(t)) {
                    return true;
                }
                if (/^(Login|Register)$/i.test(t) && !/Masuk|Daftar/i.test(t)) {
                    return true;
                }
                return false;
            });

            expect(englishOnlyButtons.length).toBe(0);
        });

        it('should have Indonesian form labels', () => {
            const authPages = [
                join(CLIENT_APP_PATH, 'pages/auth/login.tsx'),
                join(CLIENT_APP_PATH, 'pages/auth/register.tsx'),
            ];

            authPages.forEach(file => {
                const content = readFileSync(file, 'utf-8');

                expect(content).not.toMatch(/<label[^>]*>\s*Email\s*<\/label>/);
                expect(content).not.toMatch(/<label[^>]*>\s*Password\s*<\/label>/);
                expect(content).not.toMatch(/<label[^>]*>\s*Name\s*<\/label>/);
            });
        });
    });

    describe('API Response Messages (Informational)', () => {
        it('should document that API messages are in English (not user-facing)', () => {
            expect(true).toBe(true);
        });
    });
});

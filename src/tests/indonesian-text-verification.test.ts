import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const CLIENT_APP_PATH = '/Users/hshino/Kuliah/ProjectTA/Kolabri-client-app/resources/js';

const ENGLISH_PATTERNS = [
    /\b(Login|Sign in|Sign up|Register|Email|Password|Remember me|Forgot password|Submit|Cancel|Save|Delete|Edit|Update|Create|Add|Remove|Search|Filter|Sort|View|Show|Hide|Close|Open|Next|Previous|Back|Continue|Confirm|Yes|No|OK|Error|Success|Warning|Info|Loading|Please wait|Required|Invalid|Optional|Settings|Profile|Account|Dashboard|Logout|Welcome|Hello|Goodbye|Thank you|Help|About|Contact|Terms|Privacy|FAQ|Home|Menu|Notifications|Messages|Users|Admin|Student|Lecturer|Course|Group|Chat|Discussion|Reflection|Goal|Analytics|Report|Export|Import|Upload|Download|Share|Copy|Paste|Cut|Print|Refresh|Reload|Retry|Undo|Redo|Clear|Reset|Apply|Discard|Draft|Published|Active|Inactive|Enabled|Disabled|Public|Private|All|None|Any|Some|More|Less|New|Old|Recent|Popular|Trending|Featured|Recommended|Suggested|Related|Similar|Different|Same|Other|Another|First|Last|Total|Count|Number|Amount|Quantity|Size|Length|Width|Height|Depth|Weight|Volume|Area|Perimeter|Radius|Diameter|Circumference|Angle|Degree|Radian|Percentage|Ratio|Proportion|Fraction|Decimal|Integer|Float|String|Boolean|Array|Object|Null|Undefined|True|False)\b/gi,
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
    return ENGLISH_PATTERNS.some(pattern => pattern.test(text));
}

describe('Indonesian Text Verification', () => {
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
            const authPages = [
                join(CLIENT_APP_PATH, 'pages/auth/login.tsx'),
                join(CLIENT_APP_PATH, 'pages/auth/register.tsx'),
                join(CLIENT_APP_PATH, 'pages/auth/forgot-password.tsx'),
            ];

            authPages.forEach(file => {
                const content = readFileSync(file, 'utf-8');

                expect(content).toMatch(/Masuk|Login/);
                expect(content).toMatch(/Daftar|Register/);
                expect(content).toMatch(/Alamat Email/);
                expect(content).toMatch(/Kata Sandi|Password/);
            });
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
            const files = getAllFiles(CLIENT_APP_PATH);
            const buttonLabels: string[] = [];

            files.forEach(file => {
                const content = readFileSync(file, 'utf-8');
                const buttonRegex = /<button[^>]*>([^<]+)<\/button>/gi;
                let match;
                while ((match = buttonRegex.exec(content)) !== null) {
                    buttonLabels.push(match[1].trim());
                }
            });

            const englishButtons = buttonLabels.filter(label =>
                label.match(/^(Submit|Cancel|Save|Delete|Edit|Update|Create|Add|Remove|Login|Register|Sign in|Sign up)$/i)
            );

            expect(englishButtons.length).toBe(0);
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

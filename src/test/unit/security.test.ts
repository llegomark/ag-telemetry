/**
 * AG Telemetry - Security Utilities Unit Tests
 * Tests for security sanitization and validation functions
 */

import { expect } from 'chai';
import {
    escapeMarkdown,
    isValidPid,
    isValidCsrfToken,
    isValidAlertThresholds,
    normalizeScanInterval,
    sanitizeNotificationContent,
    sanitizeLabel
} from '../../security';

describe('Security Utilities', () => {

    describe('escapeMarkdown', () => {
        it('should return empty string for null/undefined/empty input', () => {
            expect(escapeMarkdown('')).to.equal('');
            expect(escapeMarkdown(null as unknown as string)).to.equal('');
            expect(escapeMarkdown(undefined as unknown as string)).to.equal('');
        });

        it('should escape asterisks (bold/italic)', () => {
            expect(escapeMarkdown('*bold*')).to.equal('\\*bold\\*');
            expect(escapeMarkdown('**strong**')).to.equal('\\*\\*strong\\*\\*');
        });

        it('should escape underscores (italic)', () => {
            expect(escapeMarkdown('_italic_')).to.equal('\\_italic\\_');
            expect(escapeMarkdown('__underline__')).to.equal('\\_\\_underline\\_\\_');
        });

        it('should escape backticks (code)', () => {
            expect(escapeMarkdown('`code`')).to.equal('\\`code\\`');
            expect(escapeMarkdown('```block```')).to.equal('\\`\\`\\`block\\`\\`\\`');
        });

        it('should escape square brackets (links)', () => {
            expect(escapeMarkdown('[link]')).to.equal('\\[link\\]');
            expect(escapeMarkdown('[text](url)')).to.equal('\\[text\\]\\(url\\)');
        });

        it('should escape parentheses (links)', () => {
            expect(escapeMarkdown('(url)')).to.equal('\\(url\\)');
        });

        it('should escape hash symbols (headers)', () => {
            expect(escapeMarkdown('# Header')).to.equal('\\# Header');
            expect(escapeMarkdown('## Subheader')).to.equal('\\#\\# Subheader');
        });

        it('should escape exclamation marks (images)', () => {
            expect(escapeMarkdown('![alt](img)')).to.equal('\\!\\[alt\\]\\(img\\)');
        });

        it('should escape backslashes', () => {
            expect(escapeMarkdown('path\\to\\file')).to.equal('path\\\\to\\\\file');
        });

        it('should escape pipe characters (tables)', () => {
            expect(escapeMarkdown('col1 | col2')).to.equal('col1 \\| col2');
        });

        it('should escape greater-than (blockquotes)', () => {
            expect(escapeMarkdown('> quote')).to.equal('\\> quote');
        });

        it('should handle mixed special characters', () => {
            const input = '**[Click here](http://evil.com)** to `win`!';
            const expected = '\\*\\*\\[Click here\\]\\(http://evil.com\\)\\*\\* to \\`win\\`\\!';
            expect(escapeMarkdown(input)).to.equal(expected);
        });

        it('should preserve normal text', () => {
            expect(escapeMarkdown('Normal text with spaces')).to.equal('Normal text with spaces');
            expect(escapeMarkdown('Gemini Pro High')).to.equal('Gemini Pro High');
        });

        it('should handle markdown injection attack patterns', () => {
            // Simulated attack: trying to inject a clickable link
            const attack1 = 'Test](http://evil.com)\n\n# Fake Header\n\n[Click';
            expect(escapeMarkdown(attack1)).to.not.include('](');
            expect(escapeMarkdown(attack1)).to.include('\\]\\(');

            // Simulated attack: trying to inject a command link
            const attack2 = 'Test](command:workbench.action.openSettings)';
            expect(escapeMarkdown(attack2)).to.not.include('](command:');
        });

        it('should handle unicode and emoji safely', () => {
            expect(escapeMarkdown('System 🚀 Ready')).to.equal('System 🚀 Ready');
            expect(escapeMarkdown('日本語テスト')).to.equal('日本語テスト');
        });
    });

    describe('isValidPid', () => {
        it('should return true for valid PIDs', () => {
            expect(isValidPid(1)).to.be.true;
            expect(isValidPid(100)).to.be.true;
            expect(isValidPid(12345)).to.be.true;
            expect(isValidPid(4194304)).to.be.true; // Max valid PID
        });

        it('should return false for zero', () => {
            expect(isValidPid(0)).to.be.false;
        });

        it('should return false for negative numbers', () => {
            expect(isValidPid(-1)).to.be.false;
            expect(isValidPid(-100)).to.be.false;
        });

        it('should return false for PIDs above maximum', () => {
            expect(isValidPid(4194305)).to.be.false;
            expect(isValidPid(10000000)).to.be.false;
        });

        it('should return false for non-integers', () => {
            expect(isValidPid(1.5)).to.be.false;
            expect(isValidPid(100.99)).to.be.false;
            expect(isValidPid(NaN)).to.be.false;
            expect(isValidPid(Infinity)).to.be.false;
        });

        it('should handle edge cases at boundaries', () => {
            expect(isValidPid(1)).to.be.true;        // Lower bound
            expect(isValidPid(4194304)).to.be.true;  // Upper bound
            expect(isValidPid(0)).to.be.false;       // Below lower bound
            expect(isValidPid(4194305)).to.be.false; // Above upper bound
        });
    });

    describe('isValidCsrfToken', () => {
        it('should return true for valid tokens', () => {
            expect(isValidCsrfToken('abc123')).to.be.true;
            expect(isValidCsrfToken('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).to.be.true;
            expect(isValidCsrfToken('ABCDEF123456')).to.be.true;
        });

        it('should return false for invalid length', () => {
            expect(isValidCsrfToken('')).to.be.false;
            expect(isValidCsrfToken('abc12')).to.be.false;
            expect(isValidCsrfToken('a'.repeat(257))).to.be.false;
        });

        it('should return false for invalid characters', () => {
            expect(isValidCsrfToken('abc_123')).to.be.false;
            expect(isValidCsrfToken('abc 123')).to.be.false;
            expect(isValidCsrfToken('abc123!')).to.be.false;
            expect(isValidCsrfToken('zzzzzz')).to.be.false;
        });

        it('should return false for non-string input', () => {
            expect(isValidCsrfToken(null as unknown as string)).to.be.false;
            expect(isValidCsrfToken(undefined as unknown as string)).to.be.false;
        });
    });



    describe('isValidAlertThresholds', () => {
        it('should return true for valid ordered thresholds', () => {
            expect(isValidAlertThresholds({
                caution: 40,
                warning: 20,
                critical: 5
            })).to.be.true;

            expect(isValidAlertThresholds({
                caution: 90,
                warning: 50,
                critical: 10
            })).to.be.true;
        });

        it('should return true for boundary values (1-100)', () => {
            expect(isValidAlertThresholds({
                caution: 100,
                warning: 50,
                critical: 1
            })).to.be.true;

            expect(isValidAlertThresholds({
                caution: 3,
                warning: 2,
                critical: 1
            })).to.be.true;
        });

        it('should return false when caution <= warning', () => {
            expect(isValidAlertThresholds({
                caution: 20,
                warning: 20,
                critical: 5
            })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 15,
                warning: 20,
                critical: 5
            })).to.be.false;
        });

        it('should return false when warning <= critical', () => {
            expect(isValidAlertThresholds({
                caution: 40,
                warning: 5,
                critical: 5
            })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 40,
                warning: 4,
                critical: 5
            })).to.be.false;
        });

        it('should return false for values outside 1-100 range', () => {
            expect(isValidAlertThresholds({
                caution: 0,
                warning: 20,
                critical: 5
            })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 101,
                warning: 20,
                critical: 5
            })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 40,
                warning: -10,
                critical: 5
            })).to.be.false;
        });

        it('should return false for non-number values', () => {
            expect(isValidAlertThresholds({
                caution: '40' as unknown as number,
                warning: 20,
                critical: 5
            })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 40,
                warning: null as unknown as number,
                critical: 5
            })).to.be.false;
        });

        it('should return false for NaN or Infinity', () => {
            expect(isValidAlertThresholds({
                caution: NaN,
                warning: 20,
                critical: 5
            })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 40,
                warning: Infinity,
                critical: 5
            })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 40,
                warning: 20,
                critical: -Infinity
            })).to.be.false;
        });

        it('should return false for null or undefined', () => {
            expect(isValidAlertThresholds(null)).to.be.false;
            expect(isValidAlertThresholds(undefined)).to.be.false;
        });

        it('should return false for missing properties', () => {
            expect(isValidAlertThresholds({
                caution: 40,
                warning: 20
            } as { caution: number; warning: number; critical: number })).to.be.false;

            expect(isValidAlertThresholds({
                caution: 40
            } as { caution: number; warning: number; critical: number })).to.be.false;

            expect(isValidAlertThresholds({} as { caution: number; warning: number; critical: number })).to.be.false;
        });
    });

    describe('normalizeScanInterval', () => {
        it('should clamp values below minimum to 30 seconds', () => {
            expect(normalizeScanInterval(0)).to.equal(30);
            expect(normalizeScanInterval(-5)).to.equal(30);
            expect(normalizeScanInterval(10)).to.equal(30);
        });

        it('should clamp values above maximum to 86400 seconds', () => {
            expect(normalizeScanInterval(90000)).to.equal(86400);
            expect(normalizeScanInterval(1000000)).to.equal(86400);
        });

        it('should floor fractional values', () => {
            expect(normalizeScanInterval(45.9)).to.equal(45);
        });

        it('should use fallback for non-finite values', () => {
            expect(normalizeScanInterval(NaN, 120)).to.equal(120);
            expect(normalizeScanInterval(Infinity, 120)).to.equal(120);
        });

        it('should use default fallback when input and fallback are invalid', () => {
            expect(normalizeScanInterval(NaN, NaN as unknown as number)).to.equal(90);
        });

        it('should fall back when value is not a number', () => {
            expect(normalizeScanInterval('90' as unknown as number, 120)).to.equal(120);
        });

        it('should clamp fallback into valid range', () => {
            expect(normalizeScanInterval(undefined, 10)).to.equal(30);
            expect(normalizeScanInterval(undefined, 100000)).to.equal(86400);
        });
    });

    describe('sanitizeNotificationContent', () => {
        it('should return empty string for null/undefined/empty input', () => {
            expect(sanitizeNotificationContent('')).to.equal('');
            expect(sanitizeNotificationContent(null as unknown as string)).to.equal('');
            expect(sanitizeNotificationContent(undefined as unknown as string)).to.equal('');
        });

        it('should preserve normal text', () => {
            expect(sanitizeNotificationContent('Gemini Pro')).to.equal('Gemini Pro');
            expect(sanitizeNotificationContent('Claude 3.5 Sonnet')).to.equal('Claude 3.5 Sonnet');
        });

        it('should remove control characters', () => {
            // Null byte
            expect(sanitizeNotificationContent('Test\x00String')).to.equal('TestString');
            // Tab (control char \x09) - removed entirely
            expect(sanitizeNotificationContent('Test\tString')).to.equal('TestString');
            // Newline (\x0A) - removed entirely
            expect(sanitizeNotificationContent('Test\nString')).to.equal('TestString');
            // Carriage return (\x0D) - removed entirely
            expect(sanitizeNotificationContent('Test\rString')).to.equal('TestString');
            // Bell (\x07)
            expect(sanitizeNotificationContent('Test\x07String')).to.equal('TestString');
            // Multiple spaces (not control chars) are normalized
            expect(sanitizeNotificationContent('Test   String')).to.equal('Test String');
        });

        it('should remove zero-width characters', () => {
            // Zero-width space (U+200B)
            expect(sanitizeNotificationContent('Test\u200BString')).to.equal('TestString');
            // Zero-width non-joiner (U+200C)
            expect(sanitizeNotificationContent('Test\u200CString')).to.equal('TestString');
            // Zero-width joiner (U+200D)
            expect(sanitizeNotificationContent('Test\u200DString')).to.equal('TestString');
            // Left-to-right mark (U+200E)
            expect(sanitizeNotificationContent('Test\u200EString')).to.equal('TestString');
            // Right-to-left mark (U+200F)
            expect(sanitizeNotificationContent('Test\u200FString')).to.equal('TestString');
            // Byte order mark (U+FEFF)
            expect(sanitizeNotificationContent('\uFEFFTest')).to.equal('Test');
        });

        it('should normalize excessive whitespace', () => {
            expect(sanitizeNotificationContent('Test   String')).to.equal('Test String');
            expect(sanitizeNotificationContent('  Leading')).to.equal('Leading');
            expect(sanitizeNotificationContent('Trailing  ')).to.equal('Trailing');
            expect(sanitizeNotificationContent('  Both  ')).to.equal('Both');
        });

        it('should truncate strings exceeding max length', () => {
            const longString = 'A'.repeat(150);
            const result = sanitizeNotificationContent(longString);
            expect(result.length).to.equal(100); // default maxLength
            expect(result.endsWith('...')).to.be.true;
        });

        it('should respect custom max length', () => {
            const input = 'This is a test string for truncation';
            const result = sanitizeNotificationContent(input, 20);
            expect(result.length).to.equal(20);
            expect(result).to.equal('This is a test st...');
        });

        it('should not truncate strings at or below max length', () => {
            const input = 'Short text';
            expect(sanitizeNotificationContent(input, 100)).to.equal('Short text');
            expect(sanitizeNotificationContent(input, 10)).to.equal('Short text');
        });

        it('should handle very small maxLength values gracefully', () => {
            const input = 'This is a long string';
            // Minimum effective maxLength is 4 to fit "X..."
            expect(sanitizeNotificationContent(input, 1)).to.equal('T...');
            expect(sanitizeNotificationContent(input, 2)).to.equal('T...');
            expect(sanitizeNotificationContent(input, 3)).to.equal('T...');
            expect(sanitizeNotificationContent(input, 4)).to.equal('T...');
            expect(sanitizeNotificationContent(input, 5)).to.equal('Th...');
            expect(sanitizeNotificationContent(input, 0)).to.equal('T...');
            expect(sanitizeNotificationContent(input, -5)).to.equal('T...');
        });

        it('should handle unicode and emoji safely', () => {
            expect(sanitizeNotificationContent('System 🚀')).to.equal('System 🚀');
            expect(sanitizeNotificationContent('日本語')).to.equal('日本語');
            expect(sanitizeNotificationContent('Ñoño')).to.equal('Ñoño');
        });

        it('should handle potential spoofing attempts', () => {
            // Right-to-left override (U+202E) - used for spoofing text direction
            expect(sanitizeNotificationContent('Test\u202EEvil')).to.equal('TestEvil');
            // Line separator (U+2028)
            expect(sanitizeNotificationContent('Line1\u2028Line2')).to.equal('Line1Line2');
            // Paragraph separator (U+2029)
            expect(sanitizeNotificationContent('Para1\u2029Para2')).to.equal('Para1Para2');
        });

        it('should handle combined attacks', () => {
            // Long string with control chars and zero-width chars
            const attack = '\u200B' + 'A'.repeat(200) + '\x00\u200E';
            const result = sanitizeNotificationContent(attack, 50);
            expect(result.length).to.equal(50);
            expect(result.endsWith('...')).to.be.true;
            expect(result).to.not.include('\u200B');
            expect(result).to.not.include('\x00');
        });
    });

    describe('sanitizeLabel', () => {
        it('should return empty string for null/undefined/empty input', () => {
            expect(sanitizeLabel('')).to.equal('');
            expect(sanitizeLabel(null as unknown as string)).to.equal('');
            expect(sanitizeLabel(undefined as unknown as string)).to.equal('');
        });

        it('should preserve normal text', () => {
            expect(sanitizeLabel('Gemini Pro')).to.equal('Gemini Pro');
            expect(sanitizeLabel('Claude 3.5 Sonnet')).to.equal('Claude 3.5 Sonnet');
            expect(sanitizeLabel('GPT-4o')).to.equal('GPT-4o');
        });

        it('should remove control characters', () => {
            // Null byte
            expect(sanitizeLabel('Test\x00String')).to.equal('TestString');
            // Tab
            expect(sanitizeLabel('Test\tString')).to.equal('TestString');
            // Newline
            expect(sanitizeLabel('Test\nString')).to.equal('TestString');
            // Carriage return
            expect(sanitizeLabel('Test\rString')).to.equal('TestString');
            // Bell
            expect(sanitizeLabel('Test\x07String')).to.equal('TestString');
        });

        it('should remove zero-width characters', () => {
            // Zero-width space
            expect(sanitizeLabel('Test\u200BString')).to.equal('TestString');
            // Zero-width non-joiner
            expect(sanitizeLabel('Test\u200CString')).to.equal('TestString');
            // Zero-width joiner
            expect(sanitizeLabel('Test\u200DString')).to.equal('TestString');
            // Byte order mark
            expect(sanitizeLabel('\uFEFFTest')).to.equal('Test');
        });

        it('should remove VS Code codicon sequences', () => {
            // Simple codicon
            expect(sanitizeLabel('$(error) Error')).to.equal('Error');
            // Codicon with modifier
            expect(sanitizeLabel('$(sync~spin) Loading')).to.equal('Loading');
            // Multiple codicons
            expect(sanitizeLabel('$(pass) OK $(warning) Warn')).to.equal('OK Warn');
            // Codicon at end
            expect(sanitizeLabel('Status $(check)')).to.equal('Status');
            // Only codicon
            expect(sanitizeLabel('$(icon)')).to.equal('');
        });

        it('should prevent codicon injection attacks', () => {
            // Attacker tries to inject error icon to spoof alerts
            const attack1 = 'Gemini Pro$(error)';
            expect(sanitizeLabel(attack1)).to.equal('Gemini Pro');

            // Attacker tries to inject warning icon
            const attack2 = '$(warning)Critical System';
            expect(sanitizeLabel(attack2)).to.equal('Critical System');

            // Nested/malformed codicons
            expect(sanitizeLabel('Test$($()nested)')).to.equal('Testnested)');
        });

        it('should normalize excessive whitespace', () => {
            expect(sanitizeLabel('Test   String')).to.equal('Test String');
            expect(sanitizeLabel('  Leading')).to.equal('Leading');
            expect(sanitizeLabel('Trailing  ')).to.equal('Trailing');
            expect(sanitizeLabel('  Both  ')).to.equal('Both');
        });

        it('should truncate strings exceeding max length', () => {
            const longString = 'A'.repeat(100);
            const result = sanitizeLabel(longString); // default maxLength is 64
            expect(result.length).to.equal(64);
            expect(result.endsWith('...')).to.be.true;
        });

        it('should respect custom max length', () => {
            const input = 'This is a test string for truncation testing';
            const result = sanitizeLabel(input, 20);
            expect(result.length).to.equal(20);
            expect(result).to.equal('This is a test st...');
        });

        it('should not truncate strings at or below max length', () => {
            const input = 'Short text';
            expect(sanitizeLabel(input, 100)).to.equal('Short text');
            expect(sanitizeLabel(input, 64)).to.equal('Short text');
        });

        it('should handle very small maxLength values gracefully', () => {
            const input = 'This is a long string';
            // Minimum effective maxLength is 4
            expect(sanitizeLabel(input, 1)).to.equal('T...');
            expect(sanitizeLabel(input, 2)).to.equal('T...');
            expect(sanitizeLabel(input, 3)).to.equal('T...');
            expect(sanitizeLabel(input, 4)).to.equal('T...');
            expect(sanitizeLabel(input, 5)).to.equal('Th...');
        });

        it('should handle unicode and emoji safely', () => {
            expect(sanitizeLabel('System 🚀')).to.equal('System 🚀');
            expect(sanitizeLabel('日本語テスト')).to.equal('日本語テスト');
            expect(sanitizeLabel('Ñoño Español')).to.equal('Ñoño Español');
        });

        it('should handle combined attacks', () => {
            // Codicons + control chars + zero-width chars
            // Note: \n is a control char and gets removed, leaving no space between Test and String
            const attack = '$(error)\u200B' + 'Test\x00\n$(warning)String' + '\u200E';
            const result = sanitizeLabel(attack);
            expect(result).to.equal('TestString');
            expect(result).to.not.include('$(');
            expect(result).to.not.include('\u200B');
            expect(result).to.not.include('\x00');

            // Test with explicit space preserved
            const attackWithSpace = '$(error) Test $(warning) String';
            expect(sanitizeLabel(attackWithSpace)).to.equal('Test String');
        });

        it('should handle malformed telemetry payloads', () => {
            // Missing label (would return empty after validation)
            expect(sanitizeLabel('')).to.equal('');

            // NaN-like string labels (should pass through)
            expect(sanitizeLabel('NaN')).to.equal('NaN');

            // Very long malicious label
            const longAttack = '$(error)'.repeat(100) + 'A'.repeat(1000);
            const result = sanitizeLabel(longAttack, 64);
            expect(result.length).to.equal(64);
            expect(result).to.not.include('$(');
        });
    });
});

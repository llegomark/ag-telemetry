/**
 * AG Telemetry - Security Utilities Unit Tests
 * Tests for escapeMarkdown, isValidPid, and isValidTrendDataPoint
 */

import { expect } from 'chai';
import { escapeMarkdown, isValidPid, isValidTrendDataPoint } from '../../security';

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

    describe('isValidTrendDataPoint', () => {
        it('should return true for valid data points', () => {
            const valid = {
                timestamp: Date.now(),
                systemId: 'gemini-pro',
                fuelLevel: 0.75
            };
            expect(isValidTrendDataPoint(valid)).to.be.true;
        });

        it('should return true for boundary fuel levels', () => {
            expect(isValidTrendDataPoint({
                timestamp: 1,
                systemId: 'test',
                fuelLevel: 0
            })).to.be.true;

            expect(isValidTrendDataPoint({
                timestamp: 1,
                systemId: 'test',
                fuelLevel: 1
            })).to.be.true;
        });

        it('should return false for null or undefined', () => {
            expect(isValidTrendDataPoint(null)).to.be.false;
            expect(isValidTrendDataPoint(undefined)).to.be.false;
        });

        it('should return false for non-objects', () => {
            expect(isValidTrendDataPoint('string')).to.be.false;
            expect(isValidTrendDataPoint(123)).to.be.false;
            expect(isValidTrendDataPoint(true)).to.be.false;
            expect(isValidTrendDataPoint([])).to.be.false;
        });

        it('should return false for missing timestamp', () => {
            expect(isValidTrendDataPoint({
                systemId: 'test',
                fuelLevel: 0.5
            })).to.be.false;
        });

        it('should return false for invalid timestamp', () => {
            expect(isValidTrendDataPoint({
                timestamp: 'invalid',
                systemId: 'test',
                fuelLevel: 0.5
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: -1,
                systemId: 'test',
                fuelLevel: 0.5
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: NaN,
                systemId: 'test',
                fuelLevel: 0.5
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: Infinity,
                systemId: 'test',
                fuelLevel: 0.5
            })).to.be.false;
        });

        it('should return false for missing systemId', () => {
            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                fuelLevel: 0.5
            })).to.be.false;
        });

        it('should return false for invalid systemId', () => {
            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: '',
                fuelLevel: 0.5
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 123,
                fuelLevel: 0.5
            })).to.be.false;

            // Test max length (256 chars)
            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'a'.repeat(257),
                fuelLevel: 0.5
            })).to.be.false;
        });

        it('should return true for systemId at max length', () => {
            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'a'.repeat(256),
                fuelLevel: 0.5
            })).to.be.true;
        });

        it('should return false for missing fuelLevel', () => {
            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'test'
            })).to.be.false;
        });

        it('should return false for invalid fuelLevel', () => {
            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'test',
                fuelLevel: 'invalid'
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'test',
                fuelLevel: -0.1
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'test',
                fuelLevel: 1.1
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'test',
                fuelLevel: NaN
            })).to.be.false;

            expect(isValidTrendDataPoint({
                timestamp: Date.now(),
                systemId: 'test',
                fuelLevel: Infinity
            })).to.be.false;
        });

        it('should handle prototype pollution attempts', () => {
            const malicious = Object.create(null);
            malicious.timestamp = Date.now();
            malicious.systemId = 'test';
            malicious.fuelLevel = 0.5;
            expect(isValidTrendDataPoint(malicious)).to.be.true;

            // Object with __proto__ property
            const protoAttack = {
                timestamp: Date.now(),
                systemId: 'test',
                fuelLevel: 0.5,
                __proto__: { isAdmin: true }
            };
            expect(isValidTrendDataPoint(protoAttack)).to.be.true;
        });

        it('should ignore extra properties', () => {
            const withExtra = {
                timestamp: Date.now(),
                systemId: 'test',
                fuelLevel: 0.5,
                extraField: 'ignored',
                anotherField: 123
            };
            expect(isValidTrendDataPoint(withExtra)).to.be.true;
        });
    });
});

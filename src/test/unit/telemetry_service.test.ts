/**
 * AG Telemetry - TelemetryService Unit Tests
 * Tests for pure functions and data processing logic
 */

import { expect } from 'chai';
import { ReadinessLevel, SystemClass, AlertThresholds, ServerTelemetryResponse } from '../../types';

// We need to test private methods, so we'll extract the pure logic for testing
// These tests validate the algorithm implementations

describe('TelemetryService Logic', () => {

    describe('formatDesignation', () => {
        // Simulating the formatDesignation logic
        function formatDesignation(label: string): string {
            return label
                .replace(/[_-]/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase())
                .trim();
        }

        it('should replace underscores with spaces', () => {
            expect(formatDesignation('gemini_pro_high')).to.equal('Gemini Pro High');
        });

        it('should replace hyphens with spaces', () => {
            expect(formatDesignation('claude-sonnet-4')).to.equal('Claude Sonnet 4');
        });

        it('should capitalize first letter of each word', () => {
            expect(formatDesignation('gpt oss 120b')).to.equal('Gpt Oss 120b');
        });

        it('should handle mixed separators', () => {
            expect(formatDesignation('gemini_pro-high')).to.equal('Gemini Pro High');
        });

        it('should trim whitespace', () => {
            expect(formatDesignation('  test model  ')).to.equal('Test Model');
        });

        it('should handle single word', () => {
            expect(formatDesignation('flash')).to.equal('Flash');
        });

        it('should handle empty string', () => {
            expect(formatDesignation('')).to.equal('');
        });
    });

    describe('classifySystem', () => {
        // Simulating the classifySystem logic
        function classifySystem(label: string): SystemClass {
            const lower = label.toLowerCase();

            if (lower.includes('flash')) return SystemClass.GEMINI_FLASH;
            if (lower.includes('gemini') || lower.includes('pro')) return SystemClass.GEMINI_PRO;
            if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus')) return SystemClass.CLAUDE;
            if (lower.includes('gpt') || lower.includes('oss')) return SystemClass.GPT;

            return SystemClass.EXPERIMENTAL;
        }

        it('should classify Gemini Flash correctly', () => {
            expect(classifySystem('gemini-flash')).to.equal(SystemClass.GEMINI_FLASH);
            expect(classifySystem('Gemini 3 Flash')).to.equal(SystemClass.GEMINI_FLASH);
        });

        it('should classify Gemini Pro correctly', () => {
            expect(classifySystem('gemini-pro')).to.equal(SystemClass.GEMINI_PRO);
            expect(classifySystem('Gemini 3 Pro High')).to.equal(SystemClass.GEMINI_PRO);
        });

        it('should prioritize Flash over Pro when both present', () => {
            // Flash check comes first, so "gemini flash pro" should be Flash
            expect(classifySystem('gemini flash pro')).to.equal(SystemClass.GEMINI_FLASH);
        });

        it('should classify Claude models correctly', () => {
            expect(classifySystem('claude-sonnet-4')).to.equal(SystemClass.CLAUDE);
            expect(classifySystem('Claude Opus 4')).to.equal(SystemClass.CLAUDE);
            expect(classifySystem('sonnet-thinking')).to.equal(SystemClass.CLAUDE);
        });

        it('should classify GPT/OSS models correctly', () => {
            expect(classifySystem('gpt-4')).to.equal(SystemClass.GPT);
            expect(classifySystem('GPT OSS 120B')).to.equal(SystemClass.GPT);
            expect(classifySystem('oss-model')).to.equal(SystemClass.GPT);
        });

        it('should classify unknown models as Experimental', () => {
            expect(classifySystem('unknown-model')).to.equal(SystemClass.EXPERIMENTAL);
            expect(classifySystem('custom')).to.equal(SystemClass.EXPERIMENTAL);
            expect(classifySystem('')).to.equal(SystemClass.EXPERIMENTAL);
        });
    });

    describe('assessReadiness', () => {
        const thresholds: AlertThresholds = {
            caution: 40,
            warning: 20,
            critical: 5
        };

        // Simulating the assessReadiness logic
        function assessReadiness(fuelLevel: number): ReadinessLevel {
            const percentage = fuelLevel * 100;

            if (percentage <= thresholds.critical) return ReadinessLevel.CRITICAL;
            if (percentage <= thresholds.warning) return ReadinessLevel.WARNING;
            if (percentage <= thresholds.caution) return ReadinessLevel.CAUTION;

            return ReadinessLevel.NOMINAL;
        }

        it('should return CRITICAL at 0%', () => {
            expect(assessReadiness(0)).to.equal(ReadinessLevel.CRITICAL);
        });

        it('should return CRITICAL at exactly critical threshold', () => {
            expect(assessReadiness(0.05)).to.equal(ReadinessLevel.CRITICAL);
        });

        it('should return WARNING between critical and warning thresholds', () => {
            expect(assessReadiness(0.06)).to.equal(ReadinessLevel.WARNING);
            expect(assessReadiness(0.10)).to.equal(ReadinessLevel.WARNING);
            expect(assessReadiness(0.20)).to.equal(ReadinessLevel.WARNING);
        });

        it('should return CAUTION between warning and caution thresholds', () => {
            expect(assessReadiness(0.21)).to.equal(ReadinessLevel.CAUTION);
            expect(assessReadiness(0.30)).to.equal(ReadinessLevel.CAUTION);
            expect(assessReadiness(0.40)).to.equal(ReadinessLevel.CAUTION);
        });

        it('should return NOMINAL above caution threshold', () => {
            expect(assessReadiness(0.41)).to.equal(ReadinessLevel.NOMINAL);
            expect(assessReadiness(0.50)).to.equal(ReadinessLevel.NOMINAL);
            expect(assessReadiness(0.75)).to.equal(ReadinessLevel.NOMINAL);
            expect(assessReadiness(1.0)).to.equal(ReadinessLevel.NOMINAL);
        });

        it('should handle edge cases at exact boundaries', () => {
            // At exactly 5% should be CRITICAL (<=5)
            expect(assessReadiness(0.05)).to.equal(ReadinessLevel.CRITICAL);
            // At exactly 20% should be WARNING (<=20)
            expect(assessReadiness(0.20)).to.equal(ReadinessLevel.WARNING);
            // At exactly 40% should be CAUTION (<=40)
            expect(assessReadiness(0.40)).to.equal(ReadinessLevel.CAUTION);
        });
    });

    describe('assessOverallReadiness', () => {
        interface MinimalFuelSystem {
            readiness: ReadinessLevel;
        }

        // Simulating the assessOverallReadiness logic
        function assessOverallReadiness(systems: MinimalFuelSystem[]): ReadinessLevel {
            if (systems.length === 0) return ReadinessLevel.OFFLINE;

            const criticalCount = systems.filter(s => s.readiness === ReadinessLevel.CRITICAL).length;
            const warningCount = systems.filter(s => s.readiness === ReadinessLevel.WARNING).length;

            if (criticalCount > 0) return ReadinessLevel.CRITICAL;
            if (warningCount >= systems.length / 2) return ReadinessLevel.WARNING;
            if (warningCount > 0) return ReadinessLevel.CAUTION;

            return ReadinessLevel.NOMINAL;
        }

        it('should return OFFLINE for empty systems array', () => {
            expect(assessOverallReadiness([])).to.equal(ReadinessLevel.OFFLINE);
        });

        it('should return NOMINAL when all systems are nominal', () => {
            const systems = [
                { readiness: ReadinessLevel.NOMINAL },
                { readiness: ReadinessLevel.NOMINAL },
                { readiness: ReadinessLevel.NOMINAL }
            ];
            expect(assessOverallReadiness(systems)).to.equal(ReadinessLevel.NOMINAL);
        });

        it('should return CRITICAL when any system is critical', () => {
            const systems = [
                { readiness: ReadinessLevel.NOMINAL },
                { readiness: ReadinessLevel.CRITICAL },
                { readiness: ReadinessLevel.NOMINAL }
            ];
            expect(assessOverallReadiness(systems)).to.equal(ReadinessLevel.CRITICAL);
        });

        it('should return WARNING when half or more systems are in warning', () => {
            const systems = [
                { readiness: ReadinessLevel.WARNING },
                { readiness: ReadinessLevel.WARNING },
                { readiness: ReadinessLevel.NOMINAL },
                { readiness: ReadinessLevel.NOMINAL }
            ];
            expect(assessOverallReadiness(systems)).to.equal(ReadinessLevel.WARNING);
        });

        it('should return CAUTION when some (less than half) systems are in warning', () => {
            const systems = [
                { readiness: ReadinessLevel.WARNING },
                { readiness: ReadinessLevel.NOMINAL },
                { readiness: ReadinessLevel.NOMINAL },
                { readiness: ReadinessLevel.NOMINAL }
            ];
            expect(assessOverallReadiness(systems)).to.equal(ReadinessLevel.CAUTION);
        });

        it('should prioritize CRITICAL over WARNING', () => {
            const systems = [
                { readiness: ReadinessLevel.CRITICAL },
                { readiness: ReadinessLevel.WARNING },
                { readiness: ReadinessLevel.WARNING }
            ];
            expect(assessOverallReadiness(systems)).to.equal(ReadinessLevel.CRITICAL);
        });

        it('should handle single system correctly', () => {
            expect(assessOverallReadiness([{ readiness: ReadinessLevel.NOMINAL }])).to.equal(ReadinessLevel.NOMINAL);
            expect(assessOverallReadiness([{ readiness: ReadinessLevel.WARNING }])).to.equal(ReadinessLevel.WARNING);
            expect(assessOverallReadiness([{ readiness: ReadinessLevel.CRITICAL }])).to.equal(ReadinessLevel.CRITICAL);
        });
    });

    describe('extractBeaconData', () => {
        const tokenPattern = /--csrf[_-]?token[=\s]+([a-f0-9-]+)/i;

        // Simulating the extractBeaconData logic for Unix
        function extractUnixBeaconData(raw: string): { pid: number; token: string } | null {
            if (!raw.trim()) return null;

            const lines = raw.trim().split('\n');
            for (const line of lines) {
                const match = line.match(tokenPattern);
                if (match) {
                    const pidMatch = line.trim().match(/^(\d+)/);
                    if (pidMatch) {
                        return { pid: parseInt(pidMatch[1], 10), token: match[1] };
                    }
                }
            }
            return null;
        }

        // Simulating the extractBeaconData logic for Windows
        function extractWin32BeaconData(raw: string): { pid: number; token: string } | null {
            if (!raw.trim()) return null;

            try {
                const data = JSON.parse(raw);
                const processes = Array.isArray(data) ? data : [data];

                for (const proc of processes) {
                    const cmdLine = proc.CommandLine || '';
                    const match = cmdLine.match(tokenPattern);
                    if (match && proc.ProcessId) {
                        return { pid: proc.ProcessId, token: match[1] };
                    }
                }
            } catch {
                return null;
            }
            return null;
        }

        describe('Unix parsing', () => {
            it('should extract PID and token from Unix ps output', () => {
                const output = '12345 /path/to/language_server --csrf-token abc123def456';
                const result = extractUnixBeaconData(output);
                expect(result).to.deep.equal({ pid: 12345, token: 'abc123def456' });
            });

            it('should handle multiple lines and find correct process', () => {
                const output = `
98765 /some/other/process
12345 /path/to/language_server --csrf_token=abc123def456
54321 /another/process
`;
                const result = extractUnixBeaconData(output);
                expect(result).to.deep.equal({ pid: 12345, token: 'abc123def456' });
            });

            it('should return null for empty output', () => {
                expect(extractUnixBeaconData('')).to.be.null;
                expect(extractUnixBeaconData('   ')).to.be.null;
            });

            it('should return null when no token found', () => {
                const output = '12345 /path/to/language_server --no-token-here';
                expect(extractUnixBeaconData(output)).to.be.null;
            });

            it('should handle token with UUID format', () => {
                const output = '12345 /path/to/language_server --csrf-token a1b2c3d4-e5f6-7890-abcd-ef1234567890';
                const result = extractUnixBeaconData(output);
                expect(result).to.deep.equal({
                    pid: 12345,
                    token: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
                });
            });
        });

        describe('Windows parsing', () => {
            it('should extract from Windows JSON output', () => {
                const output = JSON.stringify({
                    ProcessId: 12345,
                    CommandLine: 'C:\\path\\to\\language_server.exe --csrf-token abc123def456'
                });
                const result = extractWin32BeaconData(output);
                expect(result).to.deep.equal({ pid: 12345, token: 'abc123def456' });
            });

            it('should handle array of processes', () => {
                const output = JSON.stringify([
                    { ProcessId: 111, CommandLine: 'notepad.exe' },
                    { ProcessId: 12345, CommandLine: 'language_server.exe --csrf_token=abc123' }
                ]);
                const result = extractWin32BeaconData(output);
                expect(result).to.deep.equal({ pid: 12345, token: 'abc123' });
            });

            it('should return null for invalid JSON', () => {
                expect(extractWin32BeaconData('not json')).to.be.null;
            });

            it('should return null for empty JSON', () => {
                expect(extractWin32BeaconData('{}')).to.be.null;
                expect(extractWin32BeaconData('[]')).to.be.null;
            });
        });
    });

    describe('processTelemetryData', () => {
        const thresholds: AlertThresholds = {
            caution: 40,
            warning: 20,
            critical: 5
        };

        function assessReadiness(fuelLevel: number): ReadinessLevel {
            const percentage = fuelLevel * 100;
            if (percentage <= thresholds.critical) return ReadinessLevel.CRITICAL;
            if (percentage <= thresholds.warning) return ReadinessLevel.WARNING;
            if (percentage <= thresholds.caution) return ReadinessLevel.CAUTION;
            return ReadinessLevel.NOMINAL;
        }

        function classifySystem(label: string): SystemClass {
            const lower = label.toLowerCase();
            if (lower.includes('flash')) return SystemClass.GEMINI_FLASH;
            if (lower.includes('gemini') || lower.includes('pro')) return SystemClass.GEMINI_PRO;
            if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus')) return SystemClass.CLAUDE;
            if (lower.includes('gpt') || lower.includes('oss')) return SystemClass.GPT;
            return SystemClass.EXPERIMENTAL;
        }

        // Simplified processTelemetryData for testing
        function processTelemetryData(raw: ServerTelemetryResponse) {
            const configs = raw.userStatus?.cascadeModelConfigData?.clientModelConfigs ?? [];
            const systems = [];

            for (const config of configs) {
                if (!config.quotaInfo) continue;

                const fuelLevel = config.quotaInfo.remainingFraction;
                systems.push({
                    systemId: config.modelOrAlias?.model ?? config.label,
                    designation: config.label,
                    fuelLevel,
                    replenishmentEta: config.quotaInfo.resetTime,
                    readiness: assessReadiness(fuelLevel),
                    systemClass: classifySystem(config.label),
                    isOnline: true
                });
            }

            return systems.sort((a, b) => a.fuelLevel - b.fuelLevel);
        }

        it('should process valid telemetry response', () => {
            const response: ServerTelemetryResponse = {
                userStatus: {
                    cascadeModelConfigData: {
                        clientModelConfigs: [
                            {
                                label: 'gemini-pro',
                                modelOrAlias: { model: 'gemini-pro-v1' },
                                quotaInfo: { remainingFraction: 0.75 }
                            }
                        ]
                    }
                }
            };

            const result = processTelemetryData(response);
            expect(result).to.have.lengthOf(1);
            expect(result[0].systemId).to.equal('gemini-pro-v1');
            expect(result[0].fuelLevel).to.equal(0.75);
            expect(result[0].readiness).to.equal(ReadinessLevel.NOMINAL);
        });

        it('should skip configs without quotaInfo', () => {
            const response: ServerTelemetryResponse = {
                userStatus: {
                    cascadeModelConfigData: {
                        clientModelConfigs: [
                            { label: 'no-quota' },
                            {
                                label: 'with-quota',
                                quotaInfo: { remainingFraction: 0.5 }
                            }
                        ]
                    }
                }
            };

            const result = processTelemetryData(response);
            expect(result).to.have.lengthOf(1);
            expect(result[0].designation).to.equal('with-quota');
        });

        it('should sort systems by fuel level ascending', () => {
            const response: ServerTelemetryResponse = {
                userStatus: {
                    cascadeModelConfigData: {
                        clientModelConfigs: [
                            { label: 'high', quotaInfo: { remainingFraction: 0.90 } },
                            { label: 'low', quotaInfo: { remainingFraction: 0.10 } },
                            { label: 'mid', quotaInfo: { remainingFraction: 0.50 } }
                        ]
                    }
                }
            };

            const result = processTelemetryData(response);
            expect(result[0].designation).to.equal('low');
            expect(result[1].designation).to.equal('mid');
            expect(result[2].designation).to.equal('high');
        });

        it('should handle empty response', () => {
            const emptyResponse: ServerTelemetryResponse = {
                userStatus: {
                    cascadeModelConfigData: {
                        clientModelConfigs: []
                    }
                }
            };

            expect(processTelemetryData(emptyResponse)).to.deep.equal([]);
        });

        it('should handle missing nested properties', () => {
            const partialResponse: ServerTelemetryResponse = {};
            expect(processTelemetryData(partialResponse)).to.deep.equal([]);
        });
    });
});

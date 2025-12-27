/**
 * AG Telemetry - FlightDeck Unit Tests
 * Tests for status bar display logic and formatting
 */

import { expect } from 'chai';
import { ReadinessLevel, FuelSystem } from '../../types';
import { createFuelSystem } from '../helpers/factories';

describe('FlightDeck Logic', () => {

    describe('abbreviateSystem', () => {
        // Simulating the abbreviateSystem logic
        function abbreviateSystem(name: string): string {
            const lower = name.toLowerCase();

            // Common patterns
            if (lower.includes('gemini') && lower.includes('pro')) {
                return lower.includes('high') ? 'GP-H' : 'GP';
            }
            if (lower.includes('gemini') && lower.includes('flash')) {
                return 'GF';
            }
            if (lower.includes('claude') && lower.includes('sonnet')) {
                return 'CS';
            }
            if (lower.includes('claude') && lower.includes('opus')) {
                return 'CO';
            }
            if (lower.includes('gpt')) {
                return 'GPT';
            }

            // Generic abbreviation: first letters of words
            const words = name.split(/[\s-_]+/);
            if (words.length > 1) {
                return words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
            }

            return name.slice(0, 3).toUpperCase();
        }

        it('should abbreviate Gemini Pro correctly', () => {
            expect(abbreviateSystem('Gemini 3 Pro')).to.equal('GP');
            expect(abbreviateSystem('gemini-pro')).to.equal('GP');
        });

        it('should abbreviate Gemini Pro High correctly', () => {
            expect(abbreviateSystem('Gemini 3 Pro High')).to.equal('GP-H');
            expect(abbreviateSystem('gemini pro high')).to.equal('GP-H');
        });

        it('should abbreviate Gemini Flash correctly', () => {
            expect(abbreviateSystem('Gemini 3 Flash')).to.equal('GF');
            expect(abbreviateSystem('gemini-flash')).to.equal('GF');
        });

        it('should abbreviate Claude Sonnet correctly', () => {
            expect(abbreviateSystem('Claude Sonnet 4')).to.equal('CS');
            expect(abbreviateSystem('claude-sonnet-4.5')).to.equal('CS');
        });

        it('should abbreviate Claude Opus correctly', () => {
            expect(abbreviateSystem('Claude Opus 4')).to.equal('CO');
            expect(abbreviateSystem('claude opus thinking')).to.equal('CO');
        });

        it('should abbreviate GPT models correctly', () => {
            expect(abbreviateSystem('GPT-4')).to.equal('GPT');
            expect(abbreviateSystem('GPT OSS 120B')).to.equal('GPT');
        });

        it('should create generic abbreviation for unknown models', () => {
            expect(abbreviateSystem('Custom Model Name')).to.equal('CMN');
            expect(abbreviateSystem('Test-Model-X')).to.equal('TMX');
        });

        it('should handle single word names', () => {
            expect(abbreviateSystem('Experimental')).to.equal('EXP');
            expect(abbreviateSystem('AI')).to.equal('AI');
        });
    });

    describe('miniGauge', () => {
        // Simulating the miniGauge logic - distinct characters for high/medium/low
        function miniGauge(level: number): string {
            if (level >= 0.7) return '▰';  // High: filled block
            if (level >= 0.3) return '▱';  // Medium: empty block
            return '▫';                     // Low: small square (critical)
        }

        it('should return filled gauge for high levels (>=70%)', () => {
            expect(miniGauge(1.0)).to.equal('▰');
            expect(miniGauge(0.7)).to.equal('▰');
            expect(miniGauge(0.85)).to.equal('▰');
        });

        it('should return empty gauge for medium levels (30-69%)', () => {
            expect(miniGauge(0.69)).to.equal('▱');
            expect(miniGauge(0.5)).to.equal('▱');
            expect(miniGauge(0.3)).to.equal('▱');
        });

        it('should return small square for low levels (<30%)', () => {
            expect(miniGauge(0.29)).to.equal('▫');
            expect(miniGauge(0.1)).to.equal('▫');
            expect(miniGauge(0)).to.equal('▫');
        });

        it('should return distinct characters for each level range', () => {
            // Verify all three levels return different characters
            const high = miniGauge(0.8);
            const medium = miniGauge(0.5);
            const low = miniGauge(0.1);

            expect(high).to.not.equal(medium);
            expect(medium).to.not.equal(low);
            expect(high).to.not.equal(low);
        });
    });

    describe('textGauge', () => {
        // Simulating the textGauge logic
        function textGauge(level: number, width: number): string {
            const filled = Math.round(level * width);
            return '█'.repeat(filled) + '░'.repeat(width - filled);
        }

        it('should render full gauge at 100%', () => {
            expect(textGauge(1.0, 8)).to.equal('████████');
        });

        it('should render empty gauge at 0%', () => {
            expect(textGauge(0, 8)).to.equal('░░░░░░░░');
        });

        it('should render half gauge at 50%', () => {
            expect(textGauge(0.5, 8)).to.equal('████░░░░');
        });

        it('should handle different widths', () => {
            expect(textGauge(0.5, 4)).to.equal('██░░');
            expect(textGauge(0.5, 10)).to.equal('█████░░░░░');
        });

        it('should round fuel level correctly', () => {
            // 0.75 * 8 = 6
            expect(textGauge(0.75, 8)).to.equal('██████░░');
            // 0.25 * 8 = 2
            expect(textGauge(0.25, 8)).to.equal('██░░░░░░');
        });
    });

    describe('findMostCritical', () => {
        // Simulating the findMostCritical logic
        function findMostCritical(systems: FuelSystem[]): FuelSystem | null {
            if (systems.length === 0) return null;

            return systems.reduce((min, sys) =>
                sys.fuelLevel < min.fuelLevel ? sys : min
            );
        }

        it('should return null for empty array', () => {
            expect(findMostCritical([])).to.be.null;
        });

        it('should return single system', () => {
            const system = createFuelSystem({ fuelLevel: 0.5 });
            expect(findMostCritical([system])).to.deep.equal(system);
        });

        it('should return system with lowest fuel level', () => {
            const systems: FuelSystem[] = [
                createFuelSystem({ systemId: 'high', fuelLevel: 0.90 }),
                createFuelSystem({ systemId: 'low', fuelLevel: 0.10 }),
                createFuelSystem({ systemId: 'mid', fuelLevel: 0.50 })
            ];

            const result = findMostCritical(systems);
            expect(result?.systemId).to.equal('low');
        });

        it('should return first system when tied', () => {
            const systems: FuelSystem[] = [
                createFuelSystem({ systemId: 'first', fuelLevel: 0.10 }),
                createFuelSystem({ systemId: 'second', fuelLevel: 0.10 })
            ];

            const result = findMostCritical(systems);
            expect(result?.systemId).to.equal('first');
        });
    });

    describe('calculateAverageFuel', () => {
        // Simulating the calculateAverageFuel logic
        function calculateAverageFuel(systems: FuelSystem[]): number {
            if (systems.length === 0) return 0;

            const total = systems.reduce((sum, s) => sum + s.fuelLevel, 0);
            return total / systems.length;
        }

        it('should return 0 for empty array', () => {
            expect(calculateAverageFuel([])).to.equal(0);
        });

        it('should return the fuel level for single system', () => {
            const systems = [createFuelSystem({ fuelLevel: 0.75 })];
            expect(calculateAverageFuel(systems)).to.equal(0.75);
        });

        it('should calculate average correctly', () => {
            const systems = [
                createFuelSystem({ fuelLevel: 0.80 }),
                createFuelSystem({ fuelLevel: 0.60 }),
                createFuelSystem({ fuelLevel: 0.40 })
            ];
            expect(calculateAverageFuel(systems)).to.be.closeTo(0.60, 0.001);
        });

        it('should handle extreme values', () => {
            const systems = [
                createFuelSystem({ fuelLevel: 1.0 }),
                createFuelSystem({ fuelLevel: 0.0 })
            ];
            expect(calculateAverageFuel(systems)).to.equal(0.5);
        });
    });

    describe('getReadinessIndicator', () => {
        // Simulating the getReadinessIndicator logic
        function getReadinessIndicator(level: ReadinessLevel): string {
            const indicators: Record<ReadinessLevel, string> = {
                [ReadinessLevel.NOMINAL]: '●',
                [ReadinessLevel.CAUTION]: '◐',
                [ReadinessLevel.WARNING]: '◑',
                [ReadinessLevel.CRITICAL]: '○',
                [ReadinessLevel.OFFLINE]: '×'
            };
            return indicators[level];
        }

        it('should return correct indicator for NOMINAL', () => {
            expect(getReadinessIndicator(ReadinessLevel.NOMINAL)).to.equal('●');
        });

        it('should return correct indicator for CAUTION', () => {
            expect(getReadinessIndicator(ReadinessLevel.CAUTION)).to.equal('◐');
        });

        it('should return correct indicator for WARNING', () => {
            expect(getReadinessIndicator(ReadinessLevel.WARNING)).to.equal('◑');
        });

        it('should return correct indicator for CRITICAL', () => {
            expect(getReadinessIndicator(ReadinessLevel.CRITICAL)).to.equal('○');
        });

        it('should return correct indicator for OFFLINE', () => {
            expect(getReadinessIndicator(ReadinessLevel.OFFLINE)).to.equal('×');
        });
    });

    describe('getReadinessIcon', () => {
        // Simulating the getReadinessIcon logic
        function getReadinessIcon(level: ReadinessLevel): string {
            const icons: Record<ReadinessLevel, string> = {
                [ReadinessLevel.NOMINAL]: '$(pulse)',
                [ReadinessLevel.CAUTION]: '$(info)',
                [ReadinessLevel.WARNING]: '$(warning)',
                [ReadinessLevel.CRITICAL]: '$(flame)',
                [ReadinessLevel.OFFLINE]: '$(debug-disconnect)'
            };
            return icons[level];
        }

        it('should return correct VS Code icon for each level', () => {
            expect(getReadinessIcon(ReadinessLevel.NOMINAL)).to.equal('$(pulse)');
            expect(getReadinessIcon(ReadinessLevel.CAUTION)).to.equal('$(info)');
            expect(getReadinessIcon(ReadinessLevel.WARNING)).to.equal('$(warning)');
            expect(getReadinessIcon(ReadinessLevel.CRITICAL)).to.equal('$(flame)');
            expect(getReadinessIcon(ReadinessLevel.OFFLINE)).to.equal('$(debug-disconnect)');
        });
    });

    describe('getDisplaySystems', () => {
        // Simulating the getDisplaySystems logic
        function getDisplaySystems(
            systems: FuelSystem[],
            prioritySystems: string[]
        ): FuelSystem[] {
            // Prioritize user-selected systems
            const priority = systems.filter(s =>
                prioritySystems.includes(s.systemId)
            );

            if (priority.length >= 3) {
                return priority.slice(0, 3);
            }

            // Fill with lowest fuel systems
            const remaining = systems
                .filter(s => !prioritySystems.includes(s.systemId))
                .sort((a, b) => a.fuelLevel - b.fuelLevel);

            return [...priority, ...remaining].slice(0, 3);
        }

        it('should return empty array for no systems', () => {
            expect(getDisplaySystems([], [])).to.deep.equal([]);
        });

        it('should return all systems when less than 3', () => {
            const systems = [
                createFuelSystem({ systemId: 'a' }),
                createFuelSystem({ systemId: 'b' })
            ];
            expect(getDisplaySystems(systems, [])).to.have.lengthOf(2);
        });

        it('should prefer priority systems', () => {
            const systems = [
                createFuelSystem({ systemId: 'low', fuelLevel: 0.10 }),
                createFuelSystem({ systemId: 'priority', fuelLevel: 0.90 }),
                createFuelSystem({ systemId: 'mid', fuelLevel: 0.50 })
            ];

            const result = getDisplaySystems(systems, ['priority']);
            expect(result[0].systemId).to.equal('priority');
        });

        it('should fill with lowest fuel systems after priority', () => {
            const systems = [
                createFuelSystem({ systemId: 'high', fuelLevel: 0.90 }),
                createFuelSystem({ systemId: 'low', fuelLevel: 0.10 }),
                createFuelSystem({ systemId: 'mid', fuelLevel: 0.50 }),
                createFuelSystem({ systemId: 'priority', fuelLevel: 0.70 })
            ];

            const result = getDisplaySystems(systems, ['priority']);
            expect(result).to.have.lengthOf(3);
            expect(result[0].systemId).to.equal('priority');
            // Next should be lowest fuel
            expect(result[1].systemId).to.equal('low');
        });

        it('should limit to 3 systems', () => {
            const systems = [
                createFuelSystem({ systemId: 'a', fuelLevel: 0.10 }),
                createFuelSystem({ systemId: 'b', fuelLevel: 0.20 }),
                createFuelSystem({ systemId: 'c', fuelLevel: 0.30 }),
                createFuelSystem({ systemId: 'd', fuelLevel: 0.40 }),
                createFuelSystem({ systemId: 'e', fuelLevel: 0.50 })
            ];

            const result = getDisplaySystems(systems, []);
            expect(result).to.have.lengthOf(3);
        });

        it('should return only priority systems when 3+ priorities exist', () => {
            const systems = [
                createFuelSystem({ systemId: 'p1', fuelLevel: 0.90 }),
                createFuelSystem({ systemId: 'p2', fuelLevel: 0.80 }),
                createFuelSystem({ systemId: 'p3', fuelLevel: 0.70 }),
                createFuelSystem({ systemId: 'low', fuelLevel: 0.10 })
            ];

            const result = getDisplaySystems(systems, ['p1', 'p2', 'p3']);
            expect(result).to.have.lengthOf(3);
            expect(result.every(s => s.systemId.startsWith('p'))).to.be.true;
        });
    });

    describe('getBackgroundColor', () => {
        // Simulating the getBackgroundColor logic (returns string for testing)
        function getBackgroundColor(level: ReadinessLevel): string | null {
            if (level === ReadinessLevel.CRITICAL) {
                return 'statusBarItem.errorBackground';
            }
            if (level === ReadinessLevel.WARNING) {
                return 'statusBarItem.warningBackground';
            }
            return null;
        }

        it('should return error background for CRITICAL', () => {
            expect(getBackgroundColor(ReadinessLevel.CRITICAL))
                .to.equal('statusBarItem.errorBackground');
        });

        it('should return warning background for WARNING', () => {
            expect(getBackgroundColor(ReadinessLevel.WARNING))
                .to.equal('statusBarItem.warningBackground');
        });

        it('should return null for NOMINAL', () => {
            expect(getBackgroundColor(ReadinessLevel.NOMINAL)).to.be.null;
        });

        it('should return null for CAUTION', () => {
            expect(getBackgroundColor(ReadinessLevel.CAUTION)).to.be.null;
        });

        it('should return null for OFFLINE', () => {
            expect(getBackgroundColor(ReadinessLevel.OFFLINE)).to.be.null;
        });
    });

    describe('getStatusEmoji', () => {
        // Simulating the getStatusEmoji logic
        function getStatusEmoji(level: ReadinessLevel): string {
            const emojis: Record<ReadinessLevel, string> = {
                [ReadinessLevel.NOMINAL]: '🟢',
                [ReadinessLevel.CAUTION]: '🟡',
                [ReadinessLevel.WARNING]: '🟠',
                [ReadinessLevel.CRITICAL]: '🔴',
                [ReadinessLevel.OFFLINE]: '⚫'
            };
            return emojis[level];
        }

        it('should return correct emoji for each readiness level', () => {
            expect(getStatusEmoji(ReadinessLevel.NOMINAL)).to.equal('🟢');
            expect(getStatusEmoji(ReadinessLevel.CAUTION)).to.equal('🟡');
            expect(getStatusEmoji(ReadinessLevel.WARNING)).to.equal('🟠');
            expect(getStatusEmoji(ReadinessLevel.CRITICAL)).to.equal('🔴');
            expect(getStatusEmoji(ReadinessLevel.OFFLINE)).to.equal('⚫');
        });
    });
});

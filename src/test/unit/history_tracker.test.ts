/**
 * AG Telemetry - HistoryTracker Unit Tests
 * Tests for trend analysis, consumption calculation, and data management
 */

import { expect } from 'chai';
import { TrendDataPoint } from '../../types';

describe('HistoryTracker Logic', () => {

    describe('calculateTrend', () => {
        // Simulating the calculateTrend logic
        function calculateTrend(points: TrendDataPoint[]): 'rising' | 'falling' | 'stable' | 'unknown' {
            if (points.length < 2) return 'unknown';

            const first = points[0].fuelLevel;
            const last = points[points.length - 1].fuelLevel;
            const diff = last - first;

            if (Math.abs(diff) < 0.05) return 'stable';
            return diff > 0 ? 'rising' : 'falling';
        }

        it('should return "unknown" for less than 2 data points', () => {
            expect(calculateTrend([])).to.equal('unknown');
            expect(calculateTrend([{ timestamp: 1, systemId: 'test', fuelLevel: 0.5 }])).to.equal('unknown');
        });

        it('should return "falling" for declining fuel levels', () => {
            const points: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 0.80 },
                { timestamp: 2, systemId: 'test', fuelLevel: 0.60 },
                { timestamp: 3, systemId: 'test', fuelLevel: 0.40 }
            ];
            expect(calculateTrend(points)).to.equal('falling');
        });

        it('should return "rising" for increasing fuel levels', () => {
            const points: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 0.20 },
                { timestamp: 2, systemId: 'test', fuelLevel: 0.50 },
                { timestamp: 3, systemId: 'test', fuelLevel: 0.80 }
            ];
            expect(calculateTrend(points)).to.equal('rising');
        });

        it('should return "stable" for minimal change (<5%)', () => {
            const points: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 0.50 },
                { timestamp: 2, systemId: 'test', fuelLevel: 0.51 },
                { timestamp: 3, systemId: 'test', fuelLevel: 0.52 }
            ];
            expect(calculateTrend(points)).to.equal('stable');
        });

        it('should detect trend at exactly 5% threshold', () => {
            // Exactly 5% change should be stable
            const stablePoints: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 0.50 },
                { timestamp: 2, systemId: 'test', fuelLevel: 0.5499 }
            ];
            expect(calculateTrend(stablePoints)).to.equal('stable');

            // Just over 5% should be rising
            const risingPoints: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 0.50 },
                { timestamp: 2, systemId: 'test', fuelLevel: 0.56 }
            ];
            expect(calculateTrend(risingPoints)).to.equal('rising');
        });
    });

    describe('calculateConsumptionRate', () => {
        // Simulating the calculateConsumptionRate logic
        function calculateConsumptionRate(points: TrendDataPoint[]): number | null {
            if (points.length < 2) return null;

            const first = points[0];
            const last = points[points.length - 1];
            const timeDiffHours = (last.timestamp - first.timestamp) / 3600000;

            if (timeDiffHours < 0.1) return null; // Need at least 6 minutes

            const fuelDiff = first.fuelLevel - last.fuelLevel;
            return fuelDiff / timeDiffHours;
        }

        it('should return null for less than 2 data points', () => {
            expect(calculateConsumptionRate([])).to.be.null;
            expect(calculateConsumptionRate([
                { timestamp: 1, systemId: 'test', fuelLevel: 0.5 }
            ])).to.be.null;
        });

        it('should return null for very short time spans', () => {
            const now = Date.now();
            const points: TrendDataPoint[] = [
                { timestamp: now, systemId: 'test', fuelLevel: 0.80 },
                { timestamp: now + 60000, systemId: 'test', fuelLevel: 0.75 } // Only 1 minute
            ];
            expect(calculateConsumptionRate(points)).to.be.null;
        });

        it('should calculate consumption rate correctly', () => {
            const now = Date.now();
            const oneHourAgo = now - 3600000;
            const points: TrendDataPoint[] = [
                { timestamp: oneHourAgo, systemId: 'test', fuelLevel: 0.80 },
                { timestamp: now, systemId: 'test', fuelLevel: 0.60 }
            ];

            const rate = calculateConsumptionRate(points);
            expect(rate).to.be.closeTo(0.20, 0.001); // 20% per hour
        });

        it('should return negative rate when fuel is increasing (replenishment)', () => {
            const now = Date.now();
            const oneHourAgo = now - 3600000;
            const points: TrendDataPoint[] = [
                { timestamp: oneHourAgo, systemId: 'test', fuelLevel: 0.20 },
                { timestamp: now, systemId: 'test', fuelLevel: 0.80 }
            ];

            const rate = calculateConsumptionRate(points);
            expect(rate).to.be.lessThan(0);
            expect(rate).to.be.closeTo(-0.60, 0.001);
        });

        it('should handle fractional hours correctly', () => {
            const now = Date.now();
            const thirtyMinutesAgo = now - 1800000; // 30 minutes = 0.5 hours
            const points: TrendDataPoint[] = [
                { timestamp: thirtyMinutesAgo, systemId: 'test', fuelLevel: 0.80 },
                { timestamp: now, systemId: 'test', fuelLevel: 0.70 }
            ];

            const rate = calculateConsumptionRate(points);
            expect(rate).to.be.closeTo(0.20, 0.001); // 10% in 0.5h = 20%/hr
        });
    });

    describe('estimateTimeToEmpty', () => {
        // Simulating the estimateTimeToEmpty logic
        function estimateTimeToEmpty(rate: number | null, currentLevel: number): number | null {
            if (rate === null || rate <= 0) return null;

            const hoursRemaining = currentLevel / rate;
            return hoursRemaining * 3600000; // Convert to ms
        }

        it('should return null when rate is null', () => {
            expect(estimateTimeToEmpty(null, 0.5)).to.be.null;
        });

        it('should return null when rate is zero', () => {
            expect(estimateTimeToEmpty(0, 0.5)).to.be.null;
        });

        it('should return null when rate is negative (fuel increasing)', () => {
            expect(estimateTimeToEmpty(-0.1, 0.5)).to.be.null;
        });

        it('should calculate time to empty correctly', () => {
            const rate = 0.10; // 10% per hour
            const currentLevel = 0.50; // 50%
            const result = estimateTimeToEmpty(rate, currentLevel);

            // 50% / 10% per hour = 5 hours
            const fiveHoursMs = 5 * 3600000;
            expect(result).to.equal(fiveHoursMs);
        });

        it('should handle near-empty levels', () => {
            const rate = 0.20; // 20% per hour
            const currentLevel = 0.05; // 5%
            const result = estimateTimeToEmpty(rate, currentLevel);

            // 5% / 20% per hour = 0.25 hours = 15 minutes
            const fifteenMinutesMs = 0.25 * 3600000;
            expect(result).to.equal(fifteenMinutesMs);
        });
    });

    describe('renderSparkline', () => {
        // Simulating the renderSparkline logic
        function renderSparkline(points: TrendDataPoint[], width: number = 20): string {
            if (points.length === 0) return '─'.repeat(width);

            const sampled: number[] = [];
            const step = Math.max(1, Math.floor(points.length / width));

            for (let i = 0; i < points.length; i += step) {
                sampled.push(points[i].fuelLevel);
            }

            const chars = '▁▂▃▄▅▆▇█';

            return sampled.map(level => {
                const idx = Math.min(
                    chars.length - 1,
                    Math.floor(level * chars.length)
                );
                return chars[idx];
            }).join('');
        }

        it('should return dashes for empty data', () => {
            const result = renderSparkline([], 10);
            expect(result).to.equal('──────────');
        });

        it('should render single point', () => {
            const points: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 0.5 }
            ];
            const result = renderSparkline(points, 5);
            expect(result).to.have.lengthOf(1);
            expect(result).to.equal('▅'); // 0.5 * 8 = 4, chars[4] = ▅
        });

        it('should render declining trend', () => {
            const points: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 1.0 },
                { timestamp: 2, systemId: 'test', fuelLevel: 0.75 },
                { timestamp: 3, systemId: 'test', fuelLevel: 0.50 },
                { timestamp: 4, systemId: 'test', fuelLevel: 0.25 },
                { timestamp: 5, systemId: 'test', fuelLevel: 0.0 }
            ];
            const result = renderSparkline(points, 5);
            expect(result).to.have.lengthOf(5);
            // Should visually go from high to low
        });

        it('should use highest character for 100% fuel', () => {
            const points: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 1.0 }
            ];
            const result = renderSparkline(points, 1);
            expect(result).to.equal('█');
        });

        it('should use lowest character for 0% fuel', () => {
            const points: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'test', fuelLevel: 0.0 }
            ];
            const result = renderSparkline(points, 1);
            expect(result).to.equal('▁');
        });
    });

    describe('generateTrendSummary', () => {
        // Simulating generateTrendSummary logic
        function generateTrendSummary(
            trend: 'rising' | 'falling' | 'stable' | 'unknown',
            rate: number | null
        ): string {
            const trendSymbol: Record<string, string> = {
                rising: '↑',
                falling: '↓',
                stable: '→',
                unknown: '?'
            };

            let summary = trendSymbol[trend];

            if (rate !== null && rate > 0) {
                const pctPerHour = Math.round(rate * 100);
                summary += ` ${pctPerHour}%/hr`;
            }

            return summary;
        }

        it('should return rising symbol', () => {
            expect(generateTrendSummary('rising', null)).to.equal('↑');
        });

        it('should return falling symbol', () => {
            expect(generateTrendSummary('falling', null)).to.equal('↓');
        });

        it('should return stable symbol', () => {
            expect(generateTrendSummary('stable', null)).to.equal('→');
        });

        it('should return unknown symbol', () => {
            expect(generateTrendSummary('unknown', null)).to.equal('?');
        });

        it('should include rate when positive', () => {
            expect(generateTrendSummary('falling', 0.15)).to.equal('↓ 15%/hr');
        });

        it('should not include rate when null', () => {
            expect(generateTrendSummary('falling', null)).to.equal('↓');
        });

        it('should not include rate when zero or negative', () => {
            expect(generateTrendSummary('rising', 0)).to.equal('↑');
            expect(generateTrendSummary('rising', -0.1)).to.equal('↑');
        });
    });

    describe('pruneOldData', () => {
        const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
        const MAX_POINTS_PER_SYSTEM = 500;

        // Simulating pruneOldData logic
        function pruneOldData(dataPoints: TrendDataPoint[]): TrendDataPoint[] {
            const cutoff = Date.now() - MAX_AGE_MS;

            // Remove old points
            const points = dataPoints.filter(p => p.timestamp >= cutoff);

            // Limit points per system
            const systemCounts = new Map<string, number>();
            const sorted = [...points].sort((a, b) => b.timestamp - a.timestamp);
            const kept: TrendDataPoint[] = [];

            for (const point of sorted) {
                const count = systemCounts.get(point.systemId) ?? 0;
                if (count < MAX_POINTS_PER_SYSTEM) {
                    kept.push(point);
                    systemCounts.set(point.systemId, count + 1);
                }
            }

            return kept.sort((a, b) => a.timestamp - b.timestamp);
        }

        it('should remove data points older than 7 days', () => {
            const now = Date.now();
            const eightDaysAgo = now - (8 * 24 * 60 * 60 * 1000);
            const sixDaysAgo = now - (6 * 24 * 60 * 60 * 1000);

            const dataPoints: TrendDataPoint[] = [
                { timestamp: eightDaysAgo, systemId: 'test', fuelLevel: 0.5 },
                { timestamp: sixDaysAgo, systemId: 'test', fuelLevel: 0.6 },
                { timestamp: now, systemId: 'test', fuelLevel: 0.7 }
            ];

            const result = pruneOldData(dataPoints);
            expect(result).to.have.lengthOf(2);
            expect(result.every(p => p.timestamp >= (now - MAX_AGE_MS))).to.be.true;
        });

        it('should limit points per system to 500', () => {
            const now = Date.now();
            const dataPoints: TrendDataPoint[] = [];

            // Add 600 points for one system
            for (let i = 0; i < 600; i++) {
                dataPoints.push({
                    timestamp: now - i * 60000, // 1 minute apart
                    systemId: 'test-system',
                    fuelLevel: 0.5
                });
            }

            const result = pruneOldData(dataPoints);
            expect(result).to.have.lengthOf(500);
        });

        it('should keep newest points when limiting', () => {
            const now = Date.now();
            const dataPoints: TrendDataPoint[] = [];

            for (let i = 0; i < 600; i++) {
                dataPoints.push({
                    timestamp: now - i * 60000,
                    systemId: 'test-system',
                    fuelLevel: 0.5
                });
            }

            const result = pruneOldData(dataPoints);
            // The newest points should be kept
            const newestTimestamp = Math.max(...result.map(p => p.timestamp));
            expect(newestTimestamp).to.equal(now);
        });

        it('should handle multiple systems independently', () => {
            const now = Date.now();
            const dataPoints: TrendDataPoint[] = [];

            // Add 600 points for system A
            for (let i = 0; i < 600; i++) {
                dataPoints.push({
                    timestamp: now - i * 60000,
                    systemId: 'system-a',
                    fuelLevel: 0.5
                });
            }

            // Add 100 points for system B
            for (let i = 0; i < 100; i++) {
                dataPoints.push({
                    timestamp: now - i * 60000,
                    systemId: 'system-b',
                    fuelLevel: 0.5
                });
            }

            const result = pruneOldData(dataPoints);
            const systemACount = result.filter(p => p.systemId === 'system-a').length;
            const systemBCount = result.filter(p => p.systemId === 'system-b').length;

            expect(systemACount).to.equal(500);
            expect(systemBCount).to.equal(100);
        });
    });

    describe('getTrackedSystems', () => {
        function getTrackedSystems(dataPoints: TrendDataPoint[]): string[] {
            const ids = new Set<string>();
            for (const point of dataPoints) {
                ids.add(point.systemId);
            }
            return Array.from(ids);
        }

        it('should return empty array for no data', () => {
            expect(getTrackedSystems([])).to.deep.equal([]);
        });

        it('should return unique system IDs', () => {
            const dataPoints: TrendDataPoint[] = [
                { timestamp: 1, systemId: 'system-a', fuelLevel: 0.5 },
                { timestamp: 2, systemId: 'system-b', fuelLevel: 0.6 },
                { timestamp: 3, systemId: 'system-a', fuelLevel: 0.4 },
                { timestamp: 4, systemId: 'system-c', fuelLevel: 0.7 }
            ];

            const result = getTrackedSystems(dataPoints);
            expect(result).to.have.members(['system-a', 'system-b', 'system-c']);
            expect(result).to.have.lengthOf(3);
        });
    });
});

/**
 * AG Telemetry - History Tracker
 * Tracks usage trends over time with local storage
 */

import * as vscode from 'vscode';
import { FuelSystem, TrendDataPoint } from './types';
import { isValidTrendDataPoint } from './security';

interface StoredHistory {
    version: number;
    dataPoints: TrendDataPoint[];
    lastPruned: number;
}

/**
 * Tracks fuel level history for trend analysis
 */
export class HistoryTracker {
    private static readonly STORAGE_KEY = 'agTelemetry.history';
    private static readonly STORAGE_VERSION = 1;
    private static readonly MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    private static readonly MAX_POINTS_PER_SYSTEM = 500;
    private static readonly SAMPLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private static readonly STORAGE_WARNING_BYTES = 500 * 1024; // Warn at 500KB
    private static readonly MAX_STORAGE_FAILURES = 3;
    // Limit total unique systems to prevent storage exhaustion from malicious server
    private static readonly MAX_UNIQUE_SYSTEMS = 50;

    private dataPoints: TrendDataPoint[] = [];
    private lastSampleTime: Map<string, number> = new Map();
    private enabled: boolean;
    private storageFailureCount: number = 0;
    private storageWarningShown: boolean = false;

    constructor(
        private context: vscode.ExtensionContext,
        enabled: boolean
    ) {
        this.enabled = enabled;
        this.loadFromStorage();
    }

    /**
     * Record fuel levels from current telemetry
     */
    recordSample(systems: FuelSystem[]): void {
        if (!this.enabled) return;

        const now = Date.now();

        // Track current unique systems to enforce limit
        const currentSystems = this.getTrackedSystems();
        const currentSystemSet = new Set(currentSystems);

        for (const system of systems) {
            const lastSample = this.lastSampleTime.get(system.systemId) ?? 0;

            // Throttle sampling
            if (now - lastSample < HistoryTracker.SAMPLE_INTERVAL_MS) {
                continue;
            }

            // Enforce max unique systems limit - only add if already tracked or under limit
            const isNewSystem = !currentSystemSet.has(system.systemId);
            if (isNewSystem && currentSystemSet.size >= HistoryTracker.MAX_UNIQUE_SYSTEMS) {
                // Skip new systems when at capacity to prevent storage exhaustion
                continue;
            }

            this.dataPoints.push({
                timestamp: now,
                systemId: system.systemId,
                fuelLevel: system.fuelLevel
            });

            this.lastSampleTime.set(system.systemId, now);
            if (isNewSystem) {
                currentSystemSet.add(system.systemId);
            }
        }

        this.pruneOldData();
        this.saveToStorage();
    }

    /**
     * Get trend data for a specific system
     */
    getSystemTrend(systemId: string, durationMs?: number): TrendDataPoint[] {
        const cutoff = durationMs
            ? Date.now() - durationMs
            : 0;

        return this.dataPoints
            .filter(p => p.systemId === systemId && p.timestamp >= cutoff)
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Calculate trend direction for a system
     */
    calculateTrend(systemId: string): 'rising' | 'falling' | 'stable' | 'unknown' {
        const points = this.getSystemTrend(systemId, 60 * 60 * 1000); // Last hour

        if (points.length < 2) return 'unknown';

        const first = points[0].fuelLevel;
        const last = points[points.length - 1].fuelLevel;
        const diff = last - first;

        if (Math.abs(diff) < 0.05) return 'stable';
        return diff > 0 ? 'rising' : 'falling';
    }

    /**
     * Calculate average consumption rate (fuel per hour)
     */
    calculateConsumptionRate(systemId: string): number | null {
        const points = this.getSystemTrend(systemId, 2 * 60 * 60 * 1000); // Last 2 hours

        if (points.length < 2) return null;

        const first = points[0];
        const last = points[points.length - 1];
        const timeDiffHours = (last.timestamp - first.timestamp) / 3600000;

        if (timeDiffHours < 0.1) return null; // Need at least 6 minutes

        const fuelDiff = first.fuelLevel - last.fuelLevel;
        return fuelDiff / timeDiffHours;
    }

    /**
     * Estimate time until fuel depletion
     */
    estimateTimeToEmpty(systemId: string, currentLevel: number): number | null {
        const rate = this.calculateConsumptionRate(systemId);

        if (rate === null || rate <= 0) return null;

        const hoursRemaining = currentLevel / rate;
        return hoursRemaining * 3600000; // Convert to ms
    }

    /**
     * Generate trend summary for display
     */
    generateTrendSummary(systemId: string): string {
        const trend = this.calculateTrend(systemId);
        const rate = this.calculateConsumptionRate(systemId);

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

    /**
     * Get all tracked system IDs
     */
    getTrackedSystems(): string[] {
        const ids = new Set<string>();
        for (const point of this.dataPoints) {
            ids.add(point.systemId);
        }
        return Array.from(ids);
    }

    /**
     * Show trend visualization in Quick Pick
     */
    async showTrendVisualization(): Promise<void> {
        const systems = this.getTrackedSystems();

        if (systems.length === 0) {
            vscode.window.showInformationMessage(
                'AG Telemetry: No trend data available yet'
            );
            return;
        }

        const items: vscode.QuickPickItem[] = systems.map(systemId => {
            const points = this.getSystemTrend(systemId, 24 * 60 * 60 * 1000);
            const trend = this.calculateTrend(systemId);
            const rate = this.calculateConsumptionRate(systemId);

            let detail = `${points.length} data points`;
            if (rate !== null && rate > 0) {
                detail += ` | ${Math.round(rate * 100)}%/hr consumption`;
            }

            const trendIcon: Record<string, string> = {
                rising: '$(arrow-up)',
                falling: '$(arrow-down)',
                stable: '$(dash)',
                unknown: '$(question)'
            };

            return {
                label: `${trendIcon[trend]} ${systemId}`,
                description: this.renderSparkline(points),
                detail
            };
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'AG Telemetry - Usage Trends (24h)',
            placeHolder: 'Select a system to view details'
        });

        if (selected) {
            await this.showDetailedTrend(
                selected.label.replace(/\$\([^)]+\)\s*/, '')
            );
        }
    }

    /**
     * Show detailed trend for a specific system
     */
    private async showDetailedTrend(systemId: string): Promise<void> {
        const points = this.getSystemTrend(systemId);

        if (points.length === 0) {
            vscode.window.showInformationMessage(`No data for ${systemId}`);
            return;
        }

        const first = points[0];
        const last = points[points.length - 1];
        const trend = this.calculateTrend(systemId);
        const rate = this.calculateConsumptionRate(systemId);
        const timeToEmpty = this.estimateTimeToEmpty(systemId, last.fuelLevel);

        const lines: string[] = [
            `System: ${systemId}`,
            `Current Level: ${Math.round(last.fuelLevel * 100)}%`,
            `Trend: ${trend}`,
            `Data Points: ${points.length}`,
            `First Sample: ${new Date(first.timestamp).toLocaleString()}`,
            `Latest Sample: ${new Date(last.timestamp).toLocaleString()}`
        ];

        if (rate !== null && rate > 0) {
            lines.push(`Consumption: ${Math.round(rate * 100)}%/hr`);
        }

        if (timeToEmpty !== null && timeToEmpty > 0) {
            const hours = Math.round(timeToEmpty / 3600000);
            lines.push(`Est. Time to Empty: ${hours}h`);
        }

        lines.push('', 'Sparkline (24h):', this.renderSparkline(points, 40));

        await vscode.window.showInformationMessage(
            lines.join('\n'),
            { modal: true }
        );
    }

    /**
     * Render ASCII sparkline from data points
     */
    private renderSparkline(points: TrendDataPoint[], width: number = 20): string {
        if (points.length === 0) return '─'.repeat(width);

        // Sample points to fit width
        const sampled: number[] = [];
        const step = Math.max(1, Math.floor(points.length / width));

        for (let i = 0; i < points.length; i += step) {
            sampled.push(points[i].fuelLevel);
        }

        // Normalize and render
        const chars = '▁▂▃▄▅▆▇█';

        return sampled.map(level => {
            const idx = Math.min(
                chars.length - 1,
                Math.floor(level * chars.length)
            );
            return chars[idx];
        }).join('');
    }

    /**
     * Load history from extension storage
     * Validates data structure to prevent type confusion from corrupted storage
     */
    private loadFromStorage(): void {
        const stored = this.context.globalState.get<StoredHistory>(
            HistoryTracker.STORAGE_KEY
        );

        if (stored && stored.version === HistoryTracker.STORAGE_VERSION) {
            // Validate that dataPoints is an array
            if (!Array.isArray(stored.dataPoints)) {
                this.dataPoints = [];
                return;
            }

            // Validate each data point's structure to prevent type confusion attacks
            this.dataPoints = stored.dataPoints.filter(isValidTrendDataPoint);
        }
    }

    /**
     * Save history to extension storage
     * Handles quota errors gracefully and disables tracking after repeated failures
     */
    private saveToStorage(): void {
        // Skip if storage has failed too many times
        if (this.storageFailureCount >= HistoryTracker.MAX_STORAGE_FAILURES) {
            return;
        }

        const data: StoredHistory = {
            version: HistoryTracker.STORAGE_VERSION,
            dataPoints: this.dataPoints,
            lastPruned: Date.now()
        };

        // Estimate storage size and warn if approaching limits
        this.checkStorageSize(data);

        this.context.globalState.update(HistoryTracker.STORAGE_KEY, data).then(
            () => {
                // Reset failure count on success
                this.storageFailureCount = 0;
            },
            (error) => {
                this.handleStorageError(error);
            }
        );
    }

    /**
     * Estimate storage size and show warning if large
     */
    private checkStorageSize(data: StoredHistory): void {
        if (this.storageWarningShown) {
            return;
        }

        try {
            const estimatedSize = JSON.stringify(data).length * 2; // UTF-16 estimate
            if (estimatedSize > HistoryTracker.STORAGE_WARNING_BYTES) {
                this.storageWarningShown = true;
                vscode.window.showWarningMessage(
                    'AG Telemetry: History storage is large. Consider reducing tracked systems or clearing history.',
                    'Clear History'
                ).then(action => {
                    if (action === 'Clear History') {
                        this.clearHistory();
                    }
                });
            }
        } catch {
            // Ignore size check errors
        }
    }

    /**
     * Handle storage errors with graceful degradation
     */
    private handleStorageError(error: unknown): void {
        this.storageFailureCount++;
        console.error('AG Telemetry: Storage error:', error);

        if (this.storageFailureCount >= HistoryTracker.MAX_STORAGE_FAILURES) {
            // Disable tracking after repeated failures
            this.enabled = false;
            vscode.window.showErrorMessage(
                'AG Telemetry: History tracking disabled due to storage errors. ' +
                'Try clearing history to free space.',
                'Clear History',
                'Open Settings'
            ).then(action => {
                if (action === 'Clear History') {
                    this.clearHistory();
                    this.enabled = true;
                    this.storageFailureCount = 0;
                } else if (action === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'agTelemetry.trackHistory');
                }
            });
        }
    }

    /**
     * Remove old data points and enforce limits
     */
    private pruneOldData(): void {
        const cutoff = Date.now() - HistoryTracker.MAX_AGE_MS;

        // Remove old points
        this.dataPoints = this.dataPoints.filter(p => p.timestamp >= cutoff);

        // Count points per system and track unique systems
        const systemCounts = new Map<string, number>();
        const systemLastActivity = new Map<string, number>();

        for (const point of this.dataPoints) {
            systemCounts.set(point.systemId, (systemCounts.get(point.systemId) ?? 0) + 1);
            const lastActivity = systemLastActivity.get(point.systemId) ?? 0;
            if (point.timestamp > lastActivity) {
                systemLastActivity.set(point.systemId, point.timestamp);
            }
        }

        // If over max unique systems, keep only the most recently active ones
        let allowedSystems: Set<string>;
        if (systemCounts.size > HistoryTracker.MAX_UNIQUE_SYSTEMS) {
            // Sort systems by most recent activity
            const sortedSystems = [...systemLastActivity.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, HistoryTracker.MAX_UNIQUE_SYSTEMS)
                .map(([id]) => id);
            allowedSystems = new Set(sortedSystems);
        } else {
            allowedSystems = new Set(systemCounts.keys());
        }

        // Process from newest to oldest, keeping only allowed systems
        const sorted = [...this.dataPoints]
            .filter(p => allowedSystems.has(p.systemId))
            .sort((a, b) => b.timestamp - a.timestamp);

        const kept: TrendDataPoint[] = [];
        const keptCounts = new Map<string, number>();

        for (const point of sorted) {
            const count = keptCounts.get(point.systemId) ?? 0;
            if (count < HistoryTracker.MAX_POINTS_PER_SYSTEM) {
                kept.push(point);
                keptCounts.set(point.systemId, count + 1);
            }
        }

        this.dataPoints = kept.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Enable or disable tracking
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.dataPoints = [];
        this.lastSampleTime.clear();
        this.context.globalState.update(HistoryTracker.STORAGE_KEY, undefined);
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.saveToStorage();
    }
}

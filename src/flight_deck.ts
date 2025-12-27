/**
 * AG Telemetry - Flight Deck Status Bar
 * Unique cockpit-style status bar display
 */

import * as vscode from 'vscode';
import {
    FuelSystem,
    TelemetrySnapshot,
    ReadinessLevel,
    UplinkStatus
} from './types';
import { escapeMarkdown } from './security';

type FlightDeckMode = 'compact' | 'detailed' | 'minimal';

/**
 * Flight Deck - Mission control status bar display
 */
export class FlightDeck {
    private statusItem: vscode.StatusBarItem;
    private secondaryItem?: vscode.StatusBarItem;
    private mode: FlightDeckMode;
    private prioritySystems: string[];

    constructor(mode: FlightDeckMode, priority: string[]) {
        this.mode = mode;
        this.prioritySystems = priority;

        // Primary status item
        this.statusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            150
        );
        this.statusItem.command = 'agTelemetry.missionBriefing';
        this.statusItem.name = 'AG Telemetry';

        // Secondary item for detailed mode
        if (mode === 'detailed') {
            this.secondaryItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right,
                149
            );
            this.secondaryItem.name = 'AG Telemetry Details';
        }

        this.showInitialState();
    }

    /**
     * Show initial connecting state
     */
    private showInitialState(): void {
        this.statusItem.text = '$(pulse) AGT: Linking...';
        this.statusItem.tooltip = 'AG Telemetry: Establishing uplink';
        this.statusItem.backgroundColor = undefined;
        this.statusItem.show();
    }

    /**
     * Update display with new telemetry
     */
    update(snapshot: TelemetrySnapshot, uplink: UplinkStatus): void {
        if (!uplink.isConnected) {
            this.showDisconnected();
            return;
        }

        switch (this.mode) {
            case 'minimal':
                this.renderMinimal(snapshot);
                break;
            case 'detailed':
                this.renderDetailed(snapshot);
                break;
            default:
                this.renderCompact(snapshot);
        }
    }

    /**
     * Show disconnected state
     */
    showDisconnected(): void {
        this.statusItem.text = '$(debug-disconnect) AGT: Offline';
        this.statusItem.tooltip = 'AG Telemetry: No uplink\nClick to reconnect';
        this.statusItem.backgroundColor = new vscode.ThemeColor(
            'statusBarItem.errorBackground'
        );
        this.statusItem.command = 'agTelemetry.establishLink';

        this.secondaryItem?.hide();
    }

    /**
     * Show scanning state
     */
    showScanning(): void {
        this.statusItem.text = '$(sync~spin) AGT: Scanning...';
        this.statusItem.backgroundColor = undefined;
    }

    /**
     * Render minimal mode - just overall status
     */
    private renderMinimal(snapshot: TelemetrySnapshot): void {
        const indicator = this.getReadinessIndicator(snapshot.overallReadiness);
        const icon = this.getReadinessIcon(snapshot.overallReadiness);

        this.statusItem.text = `${icon} AGT ${indicator}`;
        this.statusItem.tooltip = this.buildTooltip(snapshot);
        this.statusItem.backgroundColor = this.getBackgroundColor(snapshot.overallReadiness);
        this.statusItem.command = 'agTelemetry.missionBriefing';
    }

    /**
     * Render compact mode - status + lowest system
     */
    private renderCompact(snapshot: TelemetrySnapshot): void {
        const icon = this.getReadinessIcon(snapshot.overallReadiness);

        // Find the most critical system
        const critical = this.findMostCritical(snapshot.systems);
        const avgFuel = this.calculateAverageFuel(snapshot.systems);

        let text: string;
        if (critical && critical.fuelLevel < 0.3) {
            const pct = Math.round(critical.fuelLevel * 100);
            const abbr = this.abbreviateSystem(critical.designation);
            text = `${icon} AGT ${abbr}:${pct}%`;
        } else {
            text = `${icon} AGT ${Math.round(avgFuel * 100)}%`;
        }

        this.statusItem.text = text;
        this.statusItem.tooltip = this.buildTooltip(snapshot);
        this.statusItem.backgroundColor = this.getBackgroundColor(snapshot.overallReadiness);
        this.statusItem.command = 'agTelemetry.missionBriefing';
    }

    /**
     * Render detailed mode - multiple systems
     */
    private renderDetailed(snapshot: TelemetrySnapshot): void {
        const icon = this.getReadinessIcon(snapshot.overallReadiness);

        // Primary: overall status
        this.statusItem.text = `${icon} AGT`;
        this.statusItem.tooltip = 'AG Telemetry Mission Control\nClick for briefing';
        this.statusItem.backgroundColor = this.getBackgroundColor(snapshot.overallReadiness);

        // Secondary: priority systems or top 3 lowest
        const displaySystems = this.getDisplaySystems(snapshot.systems);
        const parts = displaySystems.map(sys => {
            const abbr = this.abbreviateSystem(sys.designation);
            const pct = Math.round(sys.fuelLevel * 100);
            const gauge = this.miniGauge(sys.fuelLevel);
            return `${abbr}${gauge}${pct}`;
        });

        if (this.secondaryItem) {
            this.secondaryItem.text = parts.join(' ');
            this.secondaryItem.tooltip = this.buildTooltip(snapshot);
            this.secondaryItem.show();
        }
    }

    /**
     * Get systems to display in detailed mode
     */
    private getDisplaySystems(systems: FuelSystem[]): FuelSystem[] {
        // Prioritize user-selected systems
        const priority = systems.filter(s =>
            this.prioritySystems.includes(s.systemId)
        );

        if (priority.length >= 3) {
            return priority.slice(0, 3);
        }

        // Fill with lowest fuel systems
        const remaining = systems
            .filter(s => !this.prioritySystems.includes(s.systemId))
            .sort((a, b) => a.fuelLevel - b.fuelLevel);

        return [...priority, ...remaining].slice(0, 3);
    }

    /**
     * Create mini ASCII gauge
     * Returns distinct characters for high/medium/low fuel levels
     */
    private miniGauge(level: number): string {
        if (level >= 0.7) return '▰';  // High: filled block
        if (level >= 0.3) return '▱';  // Medium: empty block
        return '▫';                     // Low: small square (critical)
    }

    /**
     * Abbreviate system name for status bar
     */
    private abbreviateSystem(name: string): string {
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

    /**
     * Find most critical system
     */
    private findMostCritical(systems: FuelSystem[]): FuelSystem | null {
        if (systems.length === 0) return null;

        return systems.reduce((min, sys) =>
            sys.fuelLevel < min.fuelLevel ? sys : min
        );
    }

    /**
     * Calculate average fuel across systems
     */
    private calculateAverageFuel(systems: FuelSystem[]): number {
        if (systems.length === 0) return 0;

        const total = systems.reduce((sum, s) => sum + s.fuelLevel, 0);
        return total / systems.length;
    }

    /**
     * Get readiness indicator symbol
     */
    private getReadinessIndicator(level: ReadinessLevel): string {
        const indicators: Record<ReadinessLevel, string> = {
            [ReadinessLevel.NOMINAL]: '●',
            [ReadinessLevel.CAUTION]: '◐',
            [ReadinessLevel.WARNING]: '◑',
            [ReadinessLevel.CRITICAL]: '○',
            [ReadinessLevel.OFFLINE]: '×'
        };
        return indicators[level];
    }

    /**
     * Get VS Code icon for readiness
     */
    private getReadinessIcon(level: ReadinessLevel): string {
        const icons: Record<ReadinessLevel, string> = {
            [ReadinessLevel.NOMINAL]: '$(pulse)',
            [ReadinessLevel.CAUTION]: '$(info)',
            [ReadinessLevel.WARNING]: '$(warning)',
            [ReadinessLevel.CRITICAL]: '$(flame)',
            [ReadinessLevel.OFFLINE]: '$(debug-disconnect)'
        };
        return icons[level];
    }

    /**
     * Get background color for status bar
     */
    private getBackgroundColor(level: ReadinessLevel): vscode.ThemeColor | undefined {
        if (level === ReadinessLevel.CRITICAL) {
            return new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        if (level === ReadinessLevel.WARNING) {
            return new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        return undefined;
    }

    /**
     * Build comprehensive tooltip
     */
    private buildTooltip(snapshot: TelemetrySnapshot): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        // Note: isTrusted is intentionally not set to prevent command link execution
        // from potentially malicious server-derived content

        md.appendMarkdown('## AG Telemetry - Mission Status\n\n');

        // Overall status
        const statusEmoji = this.getStatusEmoji(snapshot.overallReadiness);
        md.appendMarkdown(`**Fleet Readiness:** ${statusEmoji} ${snapshot.overallReadiness}\n\n`);

        // System table
        md.appendMarkdown('| System | Fuel | Status |\n');
        md.appendMarkdown('|--------|------|--------|\n');

        const sorted = [...snapshot.systems].sort((a, b) => a.fuelLevel - b.fuelLevel);

        for (const sys of sorted.slice(0, 6)) {
            const pct = Math.round(sys.fuelLevel * 100);
            const bar = this.textGauge(sys.fuelLevel, 6);
            const status = this.getStatusEmoji(sys.readiness);
            // Escape server-derived designation to prevent markdown injection
            const safeDesignation = escapeMarkdown(sys.designation);
            md.appendMarkdown(`| ${safeDesignation} | ${bar} ${pct}% | ${status} |\n`);
        }

        if (sorted.length > 6) {
            md.appendMarkdown(`\n_+${sorted.length - 6} more systems_\n`);
        }

        md.appendMarkdown('\n---\n');
        md.appendMarkdown('_Click for Mission Briefing_');

        return md;
    }

    /**
     * Create text-based gauge
     */
    private textGauge(level: number, width: number): string {
        const filled = Math.round(level * width);
        return '█'.repeat(filled) + '░'.repeat(width - filled);
    }

    /**
     * Get emoji for status
     */
    private getStatusEmoji(level: ReadinessLevel): string {
        const emojis: Record<ReadinessLevel, string> = {
            [ReadinessLevel.NOMINAL]: '🟢',
            [ReadinessLevel.CAUTION]: '🟡',
            [ReadinessLevel.WARNING]: '🟠',
            [ReadinessLevel.CRITICAL]: '🔴',
            [ReadinessLevel.OFFLINE]: '⚫'
        };
        return emojis[level];
    }

    /**
     * Update display mode
     */
    setMode(mode: FlightDeckMode): void {
        const modeChanged = this.mode !== mode;
        this.mode = mode;

        if (modeChanged) {
            if (mode === 'detailed' && !this.secondaryItem) {
                this.secondaryItem = vscode.window.createStatusBarItem(
                    vscode.StatusBarAlignment.Right,
                    149
                );
                this.secondaryItem.name = 'AG Telemetry Details';
            } else if (mode !== 'detailed' && this.secondaryItem) {
                this.secondaryItem.dispose();
                this.secondaryItem = undefined;
            }
        }
    }

    /**
     * Update priority systems
     */
    setPrioritySystems(systems: string[]): void {
        this.prioritySystems = systems;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.statusItem.dispose();
        this.secondaryItem?.dispose();
    }
}

/**
 * AG Telemetry - Flight Deck Status Bar
 * Simplified cockpit-style status bar display
 */

import * as vscode from 'vscode';
import {
    FuelSystem,
    TelemetrySnapshot,
    ReadinessLevel,
    UplinkStatus
} from './types';
import { escapeMarkdown, sanitizeLabel } from './security';

/**
 * Flight Deck - Mission control status bar display
 * Simplified version with single compact mode
 */
export class FlightDeck {
    private statusItem: vscode.StatusBarItem;
    private opusItem: vscode.StatusBarItem;
    private lastSnapshot?: TelemetrySnapshot;

    constructor() {
        // Primary status item
        this.statusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            150
        );
        this.statusItem.command = 'agTelemetry.missionBriefing';
        this.statusItem.name = 'AG Telemetry';

        // Claude Opus status item (appears to the right of main status)
        this.opusItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            148
        );
        this.opusItem.name = 'Claude Opus Usage';

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
        this.lastSnapshot = snapshot;

        if (!uplink.isConnected) {
            this.showDisconnected();
            return;
        }

        this.renderCompact(snapshot);
        this.renderOpusStatus(snapshot);
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

        this.opusItem.hide();
    }

    /**
     * Show scanning state
     */
    showScanning(): void {
        this.statusItem.text = '$(sync~spin) AGT: Scanning...';
        this.statusItem.backgroundColor = undefined;
    }

    /**
     * Render compact mode - status + lowest system or average
     */
    private renderCompact(snapshot: TelemetrySnapshot): void {
        const icon = this.getReadinessIcon(snapshot.overallReadiness);

        // Find the most critical system
        const critical = this.findMostCritical(snapshot.systems);
        const avgFuel = this.calculateAverageFuel(snapshot.systems);

        let text: string;
        if (critical && critical.fuelLevel < 0.3) {
            const pct = Math.round(critical.fuelLevel * 100);
            const safeDesignation = sanitizeLabel(critical.designation, 32);
            const abbr = this.abbreviateSystem(safeDesignation);
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

        md.appendMarkdown('## AG Telemetry - Quota Status\n\n');

        // Overall status
        const statusEmoji = this.getStatusEmoji(snapshot.overallReadiness);
        md.appendMarkdown(`**Status:** ${statusEmoji} ${snapshot.overallReadiness}\n\n`);

        // System table with pool column
        md.appendMarkdown('| Model | Quota | Pool |\n');
        md.appendMarkdown('|-------|-------|------|\n');

        const sorted = [...snapshot.systems].sort((a, b) => a.fuelLevel - b.fuelLevel);

        for (const sys of sorted.slice(0, 8)) {
            const pct = Math.round(sys.fuelLevel * 100);
            const bar = this.textGauge(sys.fuelLevel, 6);
            const safeDesignation = escapeMarkdown(sys.designation);
            const poolIndicator = sys.quotaPoolId ? '🔗' : '—';
            md.appendMarkdown(`| ${safeDesignation} | ${bar} ${pct}% | ${poolIndicator} |\n`);
        }

        if (sorted.length > 8) {
            md.appendMarkdown(`\n_+${sorted.length - 8} more models_\n`);
        }

        // Add pool legend
        const hasPooledSystems = snapshot.systems.some(s => s.quotaPoolId);
        if (hasPooledSystems) {
            md.appendMarkdown('\n_🔗 = Shares quota with other models_\n');
        }

        md.appendMarkdown('\n---\n');
        md.appendMarkdown('_Click for details_');

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
     * Find Claude Opus thinking model from systems
     */
    private findClaudeOpusThinking(systems: FuelSystem[]): FuelSystem | null {
        const opusModels = systems.filter(sys => {
            const lower = sys.designation.toLowerCase();
            return lower.includes('claude') && lower.includes('opus');
        });

        if (opusModels.length === 0) {
            return null;
        }

        // Prefer "thinking" variants or version 4/4.5
        const thinking = opusModels.find(sys => {
            const lower = sys.designation.toLowerCase();
            return lower.includes('thinking') || lower.includes('4.5') || lower.includes('4 ');
        });

        return thinking ?? opusModels[0];
    }

    /**
     * Render Claude Opus status in dedicated status bar item
     */
    private renderOpusStatus(snapshot: TelemetrySnapshot): void {
        const opus = this.findClaudeOpusThinking(snapshot.systems);

        if (!opus) {
            this.opusItem.hide();
            return;
        }

        const pct = Math.round(opus.fuelLevel * 100);

        this.opusItem.text = `Claude Opus 4.5 (Thinking): ${pct}%`;
        this.opusItem.tooltip = `Remaining usage: ${pct}%`;
        this.opusItem.backgroundColor = undefined;
        this.opusItem.show();
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.statusItem.dispose();
        this.opusItem.dispose();
    }
}

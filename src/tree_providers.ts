/**
 * AG Telemetry - Tree Data Providers
 * Sidebar view providers for mission control interface
 */

import * as vscode from 'vscode';
import {
    FuelSystem,
    ReadinessLevel,
    TelemetrySnapshot,
    TelemetryAlert,
    UplinkStatus,
    SystemClass,
    TreeItemType
} from './types';
import { escapeMarkdown, sanitizeLabel } from './security';

/**
 * Pool data for quota pool header items
 */
interface PoolData {
    poolId: string;
}

/**
 * Tree item representing a telemetry data point
 */
class TelemetryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemType: TreeItemType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly data?: FuelSystem | TelemetryAlert | UplinkStatus | PoolData
    ) {
        super(label, collapsibleState);
    }
}

/**
 * System Status View Provider
 * Shows overall system health and uplink status
 */
export class SystemsViewProvider implements vscode.TreeDataProvider<TelemetryTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TelemetryTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private snapshot?: TelemetrySnapshot;
    private uplinkStatus?: UplinkStatus;

    refresh(snapshot?: TelemetrySnapshot, uplink?: UplinkStatus): void {
        this.snapshot = snapshot;
        this.uplinkStatus = uplink;
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TelemetryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TelemetryTreeItem): TelemetryTreeItem[] {
        if (element) return [];

        const items: TelemetryTreeItem[] = [];

        // Uplink status
        items.push(this.createUplinkItem());

        // Overall readiness
        if (this.snapshot) {
            items.push(this.createReadinessItem());
            items.push(this.createSystemCountItem());
            items.push(this.createLastScanItem());
        }

        return items;
    }

    private createUplinkItem(): TelemetryTreeItem {
        const connected = this.uplinkStatus?.isConnected ?? false;
        const signal = this.uplinkStatus?.signalStrength ?? 0;

        const label = connected
            ? `Uplink: Active (${signal}%)`
            : 'Uplink: Disconnected';

        const item = new TelemetryTreeItem(
            label,
            TreeItemType.UPLINK_STATUS,
            vscode.TreeItemCollapsibleState.None,
            this.uplinkStatus
        );

        item.iconPath = new vscode.ThemeIcon(
            connected ? 'radio-tower' : 'debug-disconnect',
            connected
                ? new vscode.ThemeColor('charts.green')
                : new vscode.ThemeColor('charts.red')
        );

        item.tooltip = connected
            ? `Port: ${this.uplinkStatus?.port}\nSignal: ${signal}%`
            : 'Click to establish uplink';

        item.command = connected ? undefined : {
            command: 'agTelemetry.establishLink',
            title: 'Establish Uplink'
        };

        return item;
    }

    private createReadinessItem(): TelemetryTreeItem {
        const readiness = this.snapshot!.overallReadiness;
        const label = `Fleet Status: ${this.getReadinessLabel(readiness)}`;

        const item = new TelemetryTreeItem(
            label,
            TreeItemType.INFO_ITEM,
            vscode.TreeItemCollapsibleState.None
        );

        item.iconPath = new vscode.ThemeIcon(
            this.getReadinessIcon(readiness),
            new vscode.ThemeColor(this.getReadinessColor(readiness))
        );

        return item;
    }

    private createSystemCountItem(): TelemetryTreeItem {
        const total = this.snapshot!.systems.length;
        const nominal = this.snapshot!.systems.filter(
            s => s.readiness === ReadinessLevel.NOMINAL
        ).length;

        const item = new TelemetryTreeItem(
            `Systems: ${nominal}/${total} Nominal`,
            TreeItemType.INFO_ITEM,
            vscode.TreeItemCollapsibleState.None
        );

        item.iconPath = new vscode.ThemeIcon('symbol-class');
        return item;
    }

    private createLastScanItem(): TelemetryTreeItem {
        const elapsed = Date.now() - this.snapshot!.timestamp;
        const seconds = Math.floor(elapsed / 1000);
        const timeStr = seconds < 60
            ? `${seconds}s ago`
            : `${Math.floor(seconds / 60)}m ago`;

        const item = new TelemetryTreeItem(
            `Last Scan: ${timeStr}`,
            TreeItemType.INFO_ITEM,
            vscode.TreeItemCollapsibleState.None
        );

        item.iconPath = new vscode.ThemeIcon('history');
        return item;
    }

    private getReadinessLabel(level: ReadinessLevel): string {
        const labels: Record<ReadinessLevel, string> = {
            [ReadinessLevel.NOMINAL]: 'All Systems Go',
            [ReadinessLevel.CAUTION]: 'Caution',
            [ReadinessLevel.WARNING]: 'Warning',
            [ReadinessLevel.CRITICAL]: 'Critical',
            [ReadinessLevel.OFFLINE]: 'Offline'
        };
        return labels[level];
    }

    private getReadinessIcon(level: ReadinessLevel): string {
        const icons: Record<ReadinessLevel, string> = {
            [ReadinessLevel.NOMINAL]: 'pass-filled',
            [ReadinessLevel.CAUTION]: 'warning',
            [ReadinessLevel.WARNING]: 'flame',
            [ReadinessLevel.CRITICAL]: 'error',
            [ReadinessLevel.OFFLINE]: 'circle-slash'
        };
        return icons[level];
    }

    private getReadinessColor(level: ReadinessLevel): string {
        const colors: Record<ReadinessLevel, string> = {
            [ReadinessLevel.NOMINAL]: 'charts.green',
            [ReadinessLevel.CAUTION]: 'charts.yellow',
            [ReadinessLevel.WARNING]: 'charts.orange',
            [ReadinessLevel.CRITICAL]: 'charts.red',
            [ReadinessLevel.OFFLINE]: 'disabledForeground'
        };
        return colors[level];
    }
}

/**
 * Fuel Reserves View Provider
 * Displays individual model fuel levels with gauges
 * Groups models by shared quota pools
 */
export class FuelViewProvider implements vscode.TreeDataProvider<TelemetryTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TelemetryTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private systems: FuelSystem[] = [];
    private prioritySystems: string[] = [];

    refresh(systems: FuelSystem[], priority: string[] = []): void {
        this.systems = systems;
        this.prioritySystems = priority;
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TelemetryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TelemetryTreeItem): TelemetryTreeItem[] {
        if (!element) {
            return this.createTopLevelItems();
        }

        // Pool header: return pool members
        if (element.itemType === TreeItemType.QUOTA_POOL) {
            const poolId = (element.data as { poolId: string }).poolId;
            return this.systems
                .filter(s => s.quotaPoolId === poolId)
                .sort((a, b) => a.designation.localeCompare(b.designation))
                .map(sys => this.createSystemItem(sys));
        }

        // System item: return details
        const system = element.data as FuelSystem;
        if (system && element.itemType === TreeItemType.FUEL_SYSTEM) {
            return this.createSystemDetails(system);
        }

        return [];
    }

    private createTopLevelItems(): TelemetryTreeItem[] {
        if (this.systems.length === 0) {
            const empty = new TelemetryTreeItem(
                'No systems detected',
                TreeItemType.INFO_ITEM,
                vscode.TreeItemCollapsibleState.None
            );
            empty.iconPath = new vscode.ThemeIcon('question');
            return [empty];
        }

        const items: TelemetryTreeItem[] = [];
        const pooledSystems = new Set<string>();

        // Group systems by pool
        const pools = new Map<string, FuelSystem[]>();
        for (const sys of this.systems) {
            if (sys.quotaPoolId) {
                const group = pools.get(sys.quotaPoolId) ?? [];
                group.push(sys);
                pools.set(sys.quotaPoolId, group);
                pooledSystems.add(sys.systemId);
            }
        }

        // Create pool headers (sorted by fuel level)
        const sortedPools = Array.from(pools.entries())
            .sort((a, b) => a[1][0].fuelLevel - b[1][0].fuelLevel);

        for (const [poolId, poolSystems] of sortedPools) {
            items.push(this.createPoolHeader(poolId, poolSystems));
        }

        // Add non-pooled systems (sorted by priority, then fuel level)
        const standalone = this.systems
            .filter(s => !pooledSystems.has(s.systemId))
            .sort((a, b) => {
                const aPriority = this.prioritySystems.includes(a.systemId) ? 0 : 1;
                const bPriority = this.prioritySystems.includes(b.systemId) ? 0 : 1;
                if (aPriority !== bPriority) return aPriority - bPriority;
                return a.fuelLevel - b.fuelLevel;
            });

        for (const sys of standalone) {
            items.push(this.createSystemItem(sys));
        }

        return items;
    }

    private createPoolHeader(poolId: string, systems: FuelSystem[]): TelemetryTreeItem {
        const percentage = Math.round(systems[0].fuelLevel * 100);
        const count = systems.length;
        const gauge = this.renderFuelGauge(systems[0].fuelLevel);

        const item = new TelemetryTreeItem(
            `Shared Pool (${count} models)`,
            TreeItemType.QUOTA_POOL,
            vscode.TreeItemCollapsibleState.Expanded,
            { poolId }
        );

        item.description = `${gauge} ${percentage}%`;
        item.iconPath = new vscode.ThemeIcon(
            'link',
            new vscode.ThemeColor(this.getReadinessColor(systems[0].readiness))
        );

        // Build tooltip with pool members
        const memberNames = systems
            .map(s => escapeMarkdown(s.designation))
            .join(', ');

        item.tooltip = new vscode.MarkdownString(
            `**Shared Quota Pool**\n\n` +
            `These ${count} models share the same usage limit:\n\n` +
            `${memberNames}\n\n` +
            `Current Level: ${percentage}%\n\n` +
            `_Using any model in this pool depletes the shared quota_`
        );

        return item;
    }

    private createSystemItem(system: FuelSystem): TelemetryTreeItem {
        const percentage = Math.round(system.fuelLevel * 100);
        const gauge = this.renderFuelGauge(system.fuelLevel);
        const isPriority = this.prioritySystems.includes(system.systemId);
        const isPooled = !!system.quotaPoolId;

        // Sanitize server-derived designation to prevent control char/codicon injection
        const safeDesignation = sanitizeLabel(system.designation);
        const label = isPriority
            ? `★ ${safeDesignation}`
            : safeDesignation;

        const item = new TelemetryTreeItem(
            label,
            TreeItemType.FUEL_SYSTEM,
            vscode.TreeItemCollapsibleState.Collapsed,
            system
        );

        // Don't show gauge for pooled systems (shown in header)
        item.description = isPooled ? '' : `${gauge} ${percentage}%`;
        item.iconPath = new vscode.ThemeIcon(
            this.getSystemClassIcon(system.systemClass),
            new vscode.ThemeColor(this.getReadinessColor(system.readiness))
        );

        // Escape server-derived content to prevent markdown injection in tooltip
        const escapedDesignation = escapeMarkdown(system.designation);

        // Build tooltip with pool info
        let tooltipText = `**${escapedDesignation}**\n\n` +
            `Fuel Level: ${percentage}%\n\n` +
            `Status: ${system.readiness}\n\n` +
            `Class: ${this.getSystemClassName(system.systemClass)}`;

        if (isPooled) {
            // Find pool siblings
            const siblings = this.systems
                .filter(s => s.quotaPoolId === system.quotaPoolId && s.systemId !== system.systemId)
                .map(s => escapeMarkdown(s.designation));

            if (siblings.length > 0) {
                tooltipText += `\n\n---\n\n$(link) **Shares quota with:**\n${siblings.join(', ')}`;
            }
        }

        item.tooltip = new vscode.MarkdownString(tooltipText);

        return item;
    }

    private createSystemDetails(system: FuelSystem): TelemetryTreeItem[] {
        const items: TelemetryTreeItem[] = [];

        // Fuel level bar
        const gaugeItem = new TelemetryTreeItem(
            `Fuel: ${this.renderDetailedGauge(system.fuelLevel)}`,
            TreeItemType.FUEL_GAUGE,
            vscode.TreeItemCollapsibleState.None
        );
        gaugeItem.iconPath = new vscode.ThemeIcon('beaker');
        items.push(gaugeItem);

        // System ID - sanitize to prevent UI injection
        const safeSystemId = sanitizeLabel(system.systemId, 128);
        const idItem = new TelemetryTreeItem(
            `ID: ${safeSystemId}`,
            TreeItemType.INFO_ITEM,
            vscode.TreeItemCollapsibleState.None
        );
        idItem.iconPath = new vscode.ThemeIcon('key');
        items.push(idItem);

        // Replenishment timer
        if (system.replenishmentEta) {
            const countdown = this.formatCountdown(system.replenishmentEta);
            const timerItem = new TelemetryTreeItem(
                `Refuel: ${countdown}`,
                TreeItemType.REPLENISH_TIMER,
                vscode.TreeItemCollapsibleState.None
            );
            timerItem.iconPath = new vscode.ThemeIcon('watch');
            items.push(timerItem);
        }

        return items;
    }

    /**
     * Render ASCII fuel gauge
     */
    private renderFuelGauge(level: number): string {
        const width = 8;
        const filled = Math.round(level * width);
        const empty = width - filled;

        return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
    }

    /**
     * Render detailed fuel gauge
     */
    private renderDetailedGauge(level: number): string {
        const width = 15;
        const filled = Math.round(level * width);
        const empty = width - filled;

        return '▐' + '█'.repeat(filled) + '░'.repeat(empty) + '▌ ' +
            Math.round(level * 100) + '%';
    }

    private formatCountdown(isoDate: string): string {
        const target = new Date(isoDate).getTime();
        const now = Date.now();
        const diff = target - now;

        if (diff <= 0) return 'Imminent';

        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);

        if (hours >= 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ${hours % 24}h`;
        }

        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    private getSystemClassIcon(cls: SystemClass): string {
        const icons: Record<SystemClass, string> = {
            [SystemClass.GEMINI_PRO]: 'star-full',
            [SystemClass.GEMINI_FLASH]: 'zap',
            [SystemClass.CLAUDE]: 'hubot',
            [SystemClass.GPT]: 'circuit-board',
            [SystemClass.EXPERIMENTAL]: 'beaker'
        };
        return icons[cls];
    }

    private getSystemClassName(cls: SystemClass): string {
        const names: Record<SystemClass, string> = {
            [SystemClass.GEMINI_PRO]: 'Gemini Pro',
            [SystemClass.GEMINI_FLASH]: 'Gemini Flash',
            [SystemClass.CLAUDE]: 'Claude',
            [SystemClass.GPT]: 'GPT',
            [SystemClass.EXPERIMENTAL]: 'Experimental'
        };
        return names[cls];
    }

    private getReadinessColor(level: ReadinessLevel): string {
        const colors: Record<ReadinessLevel, string> = {
            [ReadinessLevel.NOMINAL]: 'charts.green',
            [ReadinessLevel.CAUTION]: 'charts.yellow',
            [ReadinessLevel.WARNING]: 'charts.orange',
            [ReadinessLevel.CRITICAL]: 'charts.red',
            [ReadinessLevel.OFFLINE]: 'disabledForeground'
        };
        return colors[level];
    }
}

/**
 * Alerts View Provider
 * Shows active telemetry alerts
 */
export class AlertsViewProvider implements vscode.TreeDataProvider<TelemetryTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TelemetryTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private alerts: TelemetryAlert[] = [];

    refresh(alerts: TelemetryAlert[]): void {
        this.alerts = alerts;
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TelemetryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TelemetryTreeItem): TelemetryTreeItem[] {
        if (element) return [];

        if (this.alerts.length === 0) {
            const clear = new TelemetryTreeItem(
                'All systems nominal',
                TreeItemType.INFO_ITEM,
                vscode.TreeItemCollapsibleState.None
            );
            clear.iconPath = new vscode.ThemeIcon(
                'pass',
                new vscode.ThemeColor('charts.green')
            );
            return [clear];
        }

        return this.alerts
            .sort((a, b) => {
                // Critical first, then by timestamp
                const levelOrder: Record<ReadinessLevel, number> = {
                    [ReadinessLevel.CRITICAL]: 0,
                    [ReadinessLevel.WARNING]: 1,
                    [ReadinessLevel.CAUTION]: 2,
                    [ReadinessLevel.NOMINAL]: 3,
                    [ReadinessLevel.OFFLINE]: 4
                };
                const levelDiff = levelOrder[a.level] - levelOrder[b.level];
                return levelDiff !== 0 ? levelDiff : b.timestamp - a.timestamp;
            })
            .map(alert => this.createAlertItem(alert));
    }

    private createAlertItem(alert: TelemetryAlert): TelemetryTreeItem {
        // Sanitize server-derived content for UI labels
        const safeDesignation = sanitizeLabel(alert.systemDesignation);
        const safeMessage = sanitizeLabel(alert.message, 100);

        const item = new TelemetryTreeItem(
            safeDesignation,
            TreeItemType.ALERT_ITEM,
            vscode.TreeItemCollapsibleState.None,
            alert
        );

        item.description = safeMessage;
        item.iconPath = new vscode.ThemeIcon(
            alert.level === ReadinessLevel.CRITICAL ? 'error' : 'warning',
            new vscode.ThemeColor(
                alert.level === ReadinessLevel.CRITICAL
                    ? 'charts.red'
                    : 'charts.orange'
            )
        );

        const elapsed = Date.now() - alert.timestamp;
        const timeStr = elapsed < 60000
            ? `${Math.floor(elapsed / 1000)}s ago`
            : `${Math.floor(elapsed / 60000)}m ago`;

        // Escape server-derived content to prevent markdown injection in tooltip
        const escapedMessage = escapeMarkdown(alert.message);
        const escapedSystemDesignation = escapeMarkdown(alert.systemDesignation);
        item.tooltip = new vscode.MarkdownString(
            `**${alert.level.toUpperCase()} ALERT**\n\n` +
            `${escapedMessage}\n\n` +
            `System: ${escapedSystemDesignation}\n\n` +
            `Triggered: ${timeStr}`
        );

        return item;
    }
}

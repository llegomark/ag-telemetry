/**
 * AG Telemetry - Main Extension Entry Point
 * Mission control dashboard for Antigravity AI model monitoring
 * 
 * Simplified version focused on quota display
 */

import * as vscode from 'vscode';
import { TelemetryService } from './telemetry_service';
import { SystemsViewProvider, FuelViewProvider } from './tree_providers';
import { FlightDeck } from './flight_deck';
import {
    TelemetryConfig,
    TelemetrySnapshot,
    FuelSystem
} from './types';
import { normalizeScanInterval, sanitizeLabel } from './security';

let telemetryService: TelemetryService;
let flightDeck: FlightDeck;

let systemsProvider: SystemsViewProvider;
let fuelProvider: FuelViewProvider;

/**
 * Load configuration from VS Code settings
 */
function loadConfig(): TelemetryConfig {
    const config = vscode.workspace.getConfiguration('agTelemetry');
    const isTrusted = vscode.workspace.isTrusted;

    const readSetting = <T>(key: string, fallback: T): T => {
        if (isTrusted) {
            return config.get<T>(key, fallback);
        }

        const inspected = config.inspect<T>(key);
        if (inspected?.globalValue !== undefined) {
            return inspected.globalValue as T;
        }
        if (inspected?.defaultValue !== undefined) {
            return inspected.defaultValue as T;
        }
        return fallback;
    };

    const rawScanInterval = readSetting<number>('scanInterval', 90);
    const scanInterval = normalizeScanInterval(rawScanInterval, 90);

    return {
        scanInterval
    };
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Initialize core services
    telemetryService = new TelemetryService();
    flightDeck = new FlightDeck();

    // Initialize view providers
    systemsProvider = new SystemsViewProvider();
    fuelProvider = new FuelViewProvider();

    // Register tree views
    const systemsView = vscode.window.createTreeView('agTelemetrySystemsView', {
        treeDataProvider: systemsProvider,
        showCollapseAll: false
    });
    const fuelView = vscode.window.createTreeView('agTelemetryFuelView', {
        treeDataProvider: fuelProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(systemsView, fuelView);

    // Immediately refresh views to ensure container stays visible
    systemsProvider.refresh(undefined, { isConnected: false, signalStrength: 0 });
    fuelProvider.refresh([]);

    // Subscribe to telemetry events
    const unsubscribe = telemetryService.subscribe(event => {
        switch (event.type) {
            case 'telemetry-received':
                handleTelemetryUpdate(event.payload as TelemetrySnapshot);
                break;
            case 'uplink-established':
                vscode.window.setStatusBarMessage('$(radio-tower) AG Telemetry: Uplink established', 3000);
                break;
            case 'uplink-lost':
                flightDeck.showDisconnected();
                systemsProvider.refresh(undefined, telemetryService.getUplinkStatus());
                break;
            case 'scan-started':
                flightDeck.showScanning();
                break;
            case 'error':
                console.error('AG Telemetry error:', event.payload);
                break;
        }
    });

    context.subscriptions.push({ dispose: unsubscribe });

    // Register commands
    registerCommands(context);

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('agTelemetry')) {
                handleConfigChange();
            }
        })
    );

    // Register disposables
    context.subscriptions.push(
        { dispose: () => telemetryService.dispose() },
        { dispose: () => flightDeck.dispose() }
    );

    // Initial connection with delay
    setTimeout(async () => {
        await initializeWithRetry();
    }, 3000);
}

/**
 * Initialize with retry logic
 */
async function initializeWithRetry(attempts: number = 3): Promise<void> {
    for (let i = 0; i < attempts; i++) {
        const connected = await telemetryService.establishUplink();

        if (connected) {
            const config = loadConfig();
            await telemetryService.acquireTelemetry();
            telemetryService.startPeriodicScans(config.scanInterval);
            return;
        }

        if (i < attempts - 1) {
            await delay(2000);
        }
    }

    flightDeck.showDisconnected();
    systemsProvider.refresh(undefined, telemetryService.getUplinkStatus());

    // Silent notification via status bar
    vscode.window.setStatusBarMessage(
        '$(warning) AG Telemetry: Waiting for Antigravity connection...',
        5000
    );
}

/**
 * Handle telemetry update
 */
function handleTelemetryUpdate(snapshot: TelemetrySnapshot): void {
    const uplink = telemetryService.getUplinkStatus();

    // Update flight deck
    flightDeck.update(snapshot, uplink);

    // Update tree views
    systemsProvider.refresh(snapshot, uplink);
    fuelProvider.refresh(snapshot.systems);
}

/**
 * Handle configuration changes
 */
function handleConfigChange(): void {
    const config = loadConfig();

    // Restart periodic scans with new interval
    telemetryService.startPeriodicScans(config.scanInterval);
}

/**
 * Register all commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
    // Refresh telemetry
    context.subscriptions.push(
        vscode.commands.registerCommand('agTelemetry.refreshTelemetry', async () => {
            flightDeck.showScanning();
            await telemetryService.acquireTelemetry();
        })
    );

    // Mission briefing (simplified)
    context.subscriptions.push(
        vscode.commands.registerCommand('agTelemetry.missionBriefing', () => {
            showMissionBriefing();
        })
    );

    // Establish uplink
    context.subscriptions.push(
        vscode.commands.registerCommand('agTelemetry.establishLink', async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'AG Telemetry: Establishing uplink...',
                cancellable: false
            }, async () => {
                await initializeWithRetry(3);
            });

            const uplink = telemetryService.getUplinkStatus();
            if (uplink.isConnected) {
                vscode.window.setStatusBarMessage('$(check) AG Telemetry: Uplink established', 3000);
            } else {
                vscode.window.showErrorMessage(
                    'AG Telemetry: Failed to establish uplink. Ensure Antigravity is running.'
                );
            }
        })
    );

    // Run diagnostics
    context.subscriptions.push(
        vscode.commands.registerCommand('agTelemetry.runDiagnostics', async () => {
            await runDiagnostics();
        })
    );
}

/**
 * Show mission briefing quick pick (simplified)
 */
async function showMissionBriefing(): Promise<void> {
    const snapshot = telemetryService.getLastSnapshot();
    const uplink = telemetryService.getUplinkStatus();

    if (!snapshot || !uplink.isConnected) {
        const reconnect = await vscode.window.showWarningMessage(
            'AG Telemetry: No uplink connection',
            'Establish Uplink'
        );

        if (reconnect) {
            vscode.commands.executeCommand('agTelemetry.establishLink');
        }
        return;
    }

    const items: vscode.QuickPickItem[] = [];

    // Group systems by quota pool
    const pools = new Map<string, FuelSystem[]>();
    const standalone: FuelSystem[] = [];

    for (const sys of snapshot.systems) {
        if (sys.quotaPoolId) {
            const group = pools.get(sys.quotaPoolId) ?? [];
            group.push(sys);
            pools.set(sys.quotaPoolId, group);
        } else {
            standalone.push(sys);
        }
    }

    // Sort pools by fuel level
    const sortedPools = Array.from(pools.entries())
        .sort((a, b) => a[1][0].fuelLevel - b[1][0].fuelLevel);

    // Add pooled systems with headers
    for (const [, poolSystems] of sortedPools) {
        const pct = Math.round(poolSystems[0].fuelLevel * 100);
        const gauge = renderQuickGauge(poolSystems[0].fuelLevel);

        // Pool header
        items.push({
            label: `🔗 Shared Pool (${poolSystems.length} models)`,
            description: `${gauge} ${pct}%`,
            kind: vscode.QuickPickItemKind.Separator
        });

        // Pool members
        for (const sys of poolSystems.sort((a, b) => a.designation.localeCompare(b.designation))) {
            const safeDesignation = sanitizeLabel(sys.designation);
            items.push({
                label: `  ${getSystemIcon(sys)} ${safeDesignation}`,
                description: 'Shares quota with other models'
            });
        }
    }

    // Add standalone systems
    if (standalone.length > 0 && pools.size > 0) {
        items.push({
            label: 'Individual Models',
            kind: vscode.QuickPickItemKind.Separator
        });
    }

    for (const sys of standalone.sort((a, b) => a.fuelLevel - b.fuelLevel)) {
        const pct = Math.round(sys.fuelLevel * 100);
        const gauge = renderQuickGauge(sys.fuelLevel);
        const safeDesignation = sanitizeLabel(sys.designation);

        items.push({
            label: `${getSystemIcon(sys)} ${safeDesignation}`,
            description: `${gauge} ${pct}%`
        });
    }

    // Action: Refresh
    items.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator
    });

    items.push({
        label: '$(sync) Refresh Telemetry',
        description: 'Perform manual scan'
    });

    const selected = await vscode.window.showQuickPick(items, {
        title: 'AG Telemetry - Model Quota Status',
        placeHolder: 'View your AI model quota levels'
    });

    if (selected?.label.includes('Refresh')) {
        vscode.commands.executeCommand('agTelemetry.refreshTelemetry');
    }
}

/**
 * Render gauge for quick pick
 */
function renderQuickGauge(level: number): string {
    const width = 10;
    const filled = Math.round(level * width);
    return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

/**
 * Get icon for system based on readiness
 */
function getSystemIcon(system: FuelSystem): string {
    const icons = {
        nominal: '$(pass)',
        caution: '$(info)',
        warning: '$(warning)',
        critical: '$(error)',
        offline: '$(debug-disconnect)'
    };
    return icons[system.readiness] ?? '$(circle)';
}

/**
 * Delay utility
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run comprehensive diagnostics and display results
 */
async function runDiagnostics(): Promise<void> {
    const output = vscode.window.createOutputChannel('AG Telemetry Diagnostics');
    output.clear();
    output.show();

    output.appendLine('═══════════════════════════════════════════════════════');
    output.appendLine('         AG TELEMETRY - DIAGNOSTIC REPORT');
    output.appendLine('═══════════════════════════════════════════════════════');
    output.appendLine(`Timestamp: ${new Date().toISOString()}`);
    output.appendLine(`Extension Version: ${getExtensionVersion()}`);
    output.appendLine('');

    const diagnostic = telemetryService.getDiagnosticInfo();

    // Section 1: Uplink Status
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('1. UPLINK STATUS');
    output.appendLine('───────────────────────────────────────────────────────');

    if (diagnostic.uplink.isConnected) {
        output.appendLine('   ✓ Status: CONNECTED');
        output.appendLine(`   ✓ Port: ${diagnostic.uplink.port}`);
        output.appendLine(`   ✓ Signal Strength: ${diagnostic.uplink.signalStrength}%`);
        if (diagnostic.uplink.lastContact) {
            const elapsed = Math.round((Date.now() - diagnostic.uplink.lastContact) / 1000);
            output.appendLine(`   ✓ Last Contact: ${elapsed}s ago`);
        }
        output.appendLine(`   ✓ CSRF Token: ${diagnostic.uplink.securityToken ? 'Present' : 'Missing'}`);
    } else {
        output.appendLine('   ✗ Status: DISCONNECTED');
        output.appendLine('   ✗ No active uplink connection');
    }
    output.appendLine('');

    // Section 2: Schema Validation
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('2. SCHEMA VALIDATION');
    output.appendLine('───────────────────────────────────────────────────────');

    if (diagnostic.lastValidation) {
        if (diagnostic.lastValidation.valid) {
            output.appendLine('   ✓ Last Validation: PASSED');
            output.appendLine(`   ✓ Response Keys: [${diagnostic.lastValidation.receivedKeys.join(', ')}]`);
        } else {
            output.appendLine('   ✗ Last Validation: FAILED');
            output.appendLine('   Errors:');
            for (const error of diagnostic.lastValidation.errors) {
                output.appendLine(`     - ${error}`);
            }
        }
        if (diagnostic.lastValidation.warnings.length > 0) {
            output.appendLine('   Warnings:');
            for (const warning of diagnostic.lastValidation.warnings) {
                output.appendLine(`     - ${warning}`);
            }
        }
    } else {
        output.appendLine('   ? No validation data available yet');
    }
    output.appendLine('');

    // Section 3: Telemetry Data
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('3. TELEMETRY DATA');
    output.appendLine('───────────────────────────────────────────────────────');

    if (diagnostic.hasSnapshot) {
        output.appendLine('   ✓ Data Available: YES');
        output.appendLine(`   ✓ Systems Detected: ${diagnostic.systemCount}`);

        const snapshot = telemetryService.getLastSnapshot();
        if (snapshot && snapshot.systems.length > 0) {
            output.appendLine('   Systems:');
            for (const sys of snapshot.systems) {
                const pct = Math.round(sys.fuelLevel * 100);
                const safeDesignation = sanitizeLabel(sys.designation, 128);
                output.appendLine(`     - ${safeDesignation}: ${pct}% (${sys.readiness})`);
            }
        }
    } else {
        output.appendLine('   ✗ Data Available: NO');
        output.appendLine('   ✗ No telemetry snapshot captured yet');
    }
    output.appendLine('');

    // Summary
    output.appendLine('═══════════════════════════════════════════════════════');
    output.appendLine('                     SUMMARY');
    output.appendLine('═══════════════════════════════════════════════════════');

    const issues: string[] = [];
    if (!diagnostic.uplink.isConnected) {
        issues.push('Uplink disconnected');
    }
    if (diagnostic.consecutiveFailures > 0) {
        issues.push(`${diagnostic.consecutiveFailures} consecutive failure(s)`);
    }
    if (diagnostic.lastValidation && !diagnostic.lastValidation.valid) {
        issues.push('Schema validation failed');
    }
    if (!diagnostic.hasSnapshot) {
        issues.push('No telemetry data');
    }

    if (issues.length === 0) {
        output.appendLine('   ✓ All systems nominal');
    } else {
        output.appendLine('   Issues detected:');
        for (const issue of issues) {
            output.appendLine(`     ✗ ${issue}`);
        }
    }
    output.appendLine('');
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('To report issues: https://github.com/llegomark/ag-telemetry/issues');
    output.appendLine('───────────────────────────────────────────────────────');

    vscode.window.setStatusBarMessage('$(check) AG Telemetry: Diagnostics complete', 5000);
}

/**
 * Get extension version from package.json
 */
function getExtensionVersion(): string {
    try {
        const ext = vscode.extensions.getExtension('llegomark.ag-telemetry');
        return ext?.packageJSON?.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    telemetryService?.dispose();
    flightDeck?.dispose();
}

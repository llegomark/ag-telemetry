/**
 * AG Telemetry - Main Extension Entry Point
 * Mission control dashboard for Antigravity AI model monitoring
 */

import * as vscode from 'vscode';
import { TelemetryService } from './telemetry_service';
import { SystemsViewProvider, FuelViewProvider, AlertsViewProvider } from './tree_providers';
import { AlertManager } from './alert_manager';
import { FlightDeck } from './flight_deck';
import { HistoryTracker } from './history_tracker';
import {
    TelemetryConfig,
    AlertThresholds,
    TelemetrySnapshot,
    FuelSystem
} from './types';
import { isValidAlertThresholds } from './security';

let telemetryService: TelemetryService;
let alertManager: AlertManager;
let flightDeck: FlightDeck;
let historyTracker: HistoryTracker;

let systemsProvider: SystemsViewProvider;
let fuelProvider: FuelViewProvider;
let alertsProvider: AlertsViewProvider;

/** Default alert thresholds that are known to be valid */
const DEFAULT_THRESHOLDS: AlertThresholds = {
    caution: 40,
    warning: 20,
    critical: 5
};

/**
 * Load configuration from VS Code settings
 * Validates threshold ordering and falls back to defaults if invalid
 */
function loadConfig(): TelemetryConfig {
    const config = vscode.workspace.getConfiguration('agTelemetry');

    // Get user-configured thresholds
    const userThresholds = config.get<AlertThresholds>('alertThresholds', DEFAULT_THRESHOLDS);

    // Validate threshold ordering (caution > warning > critical)
    // Fall back to defaults if invalid to prevent incorrect alert behavior
    const alertThresholds = isValidAlertThresholds(userThresholds)
        ? userThresholds
        : DEFAULT_THRESHOLDS;

    return {
        scanInterval: config.get<number>('scanInterval', 90),
        alertThresholds,
        enableNotifications: config.get<boolean>('enableNotifications', true),
        flightDeckMode: config.get<'compact' | 'detailed' | 'minimal'>('flightDeckMode', 'compact'),
        trackHistory: config.get<boolean>('trackHistory', true),
        prioritySystems: config.get<string[]>('prioritySystems', [])
    };
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    // Security: Check workspace trust before full activation
    // In untrusted workspaces, we still activate but warn the user
    // since the extension primarily reads from a local trusted process
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(
            'AG Telemetry: Running in untrusted workspace. ' +
            'Some configuration options from workspace settings may be ignored.'
        );
    }

    const config = loadConfig();

    // Initialize core services
    telemetryService = new TelemetryService(config.alertThresholds);
    alertManager = new AlertManager(config.enableNotifications);
    flightDeck = new FlightDeck(config.flightDeckMode, config.prioritySystems);
    historyTracker = new HistoryTracker(context, config.trackHistory);

    // Initialize view providers
    systemsProvider = new SystemsViewProvider();
    fuelProvider = new FuelViewProvider();
    alertsProvider = new AlertsViewProvider();

    // Register tree views
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('agTelemetrySystemsView', systemsProvider),
        vscode.window.registerTreeDataProvider('agTelemetryFuelView', fuelProvider),
        vscode.window.registerTreeDataProvider('agTelemetryAlertsView', alertsProvider)
    );

    // Subscribe to telemetry events
    const unsubscribe = telemetryService.subscribe(event => {
        switch (event.type) {
            case 'telemetry-received':
                handleTelemetryUpdate(event.payload as TelemetrySnapshot, config);
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
            case 'error': {
                console.error('AG Telemetry error:', event.payload);
                // Handle consecutive failures with user feedback
                const errorPayload = event.payload as { type?: string; failureCount?: number } | undefined;
                if (errorPayload?.type === 'consecutive-failures' && errorPayload.failureCount) {
                    handleConsecutiveFailures(errorPayload.failureCount);
                }
                break;
            }
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
        { dispose: () => flightDeck.dispose() },
        { dispose: () => historyTracker.dispose() }
    );

    // Initial connection with delay
    setTimeout(async () => {
        await initializeWithRetry();
    }, 3000);
}

/**
 * Initialize with retry logic
 */
async function initializeWithRetry(attempts: number = 3, showNotification: boolean = true): Promise<void> {
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

    // Show user-friendly error notification with actionable guidance
    if (showNotification) {
        const action = await vscode.window.showWarningMessage(
            'AG Telemetry: Could not connect to Antigravity. Is it running?',
            'Retry Connection',
            'Open Settings'
        );

        if (action === 'Retry Connection') {
            vscode.commands.executeCommand('agTelemetry.establishLink');
        } else if (action === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'agTelemetry');
        }
    }
}

/**
 * Handle telemetry update
 */
function handleTelemetryUpdate(snapshot: TelemetrySnapshot, config: TelemetryConfig): void {
    const uplink = telemetryService.getUplinkStatus();

    // Update flight deck
    flightDeck.update(snapshot, uplink);

    // Update tree views
    systemsProvider.refresh(snapshot, uplink);
    fuelProvider.refresh(snapshot.systems, config.prioritySystems);

    // Process alerts
    const alerts = alertManager.processTelemetry(snapshot.systems);
    alertsProvider.refresh(alerts);

    // Record history
    historyTracker.recordSample(snapshot.systems);
}

/**
 * Handle configuration changes
 */
function handleConfigChange(): void {
    const config = loadConfig();

    // Update services
    telemetryService.updateThresholds(config.alertThresholds);
    alertManager.updateConfig(config.enableNotifications);
    flightDeck.setMode(config.flightDeckMode);
    flightDeck.setPrioritySystems(config.prioritySystems);
    historyTracker.setEnabled(config.trackHistory);

    // Restart periodic scans with new interval
    // Note: startPeriodicScans() internally calls stopPeriodicScans()
    telemetryService.startPeriodicScans(config.scanInterval);

    // Refresh views with current data
    const snapshot = telemetryService.getLastSnapshot();
    if (snapshot) {
        fuelProvider.refresh(snapshot.systems, config.prioritySystems);
    }
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

    // Mission briefing
    context.subscriptions.push(
        vscode.commands.registerCommand('agTelemetry.missionBriefing', () => {
            showMissionBriefing();
        })
    );

    // View trends
    context.subscriptions.push(
        vscode.commands.registerCommand('agTelemetry.viewTrends', () => {
            historyTracker.showTrendVisualization();
        })
    );

    // Configure alerts
    context.subscriptions.push(
        vscode.commands.registerCommand('agTelemetry.configureAlerts', () => {
            showAlertConfiguration();
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
                // Suppress auto-notification since we handle result manually
                await initializeWithRetry(3, false);
            });

            // Check connection status and notify user
            const uplink = telemetryService.getUplinkStatus();
            if (uplink.isConnected) {
                vscode.window.showInformationMessage('AG Telemetry: Uplink established successfully');
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
 * Show mission briefing quick pick
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

    // Section: Fleet Overview
    items.push({
        label: `Fleet Status: ${snapshot.overallReadiness.toUpperCase()}`,
        kind: vscode.QuickPickItemKind.Separator
    });

    // Sort systems by fuel level
    const sorted = [...snapshot.systems].sort((a, b) => a.fuelLevel - b.fuelLevel);

    for (const sys of sorted) {
        const pct = Math.round(sys.fuelLevel * 100);
        const gauge = renderQuickGauge(sys.fuelLevel);
        const trend = historyTracker.generateTrendSummary(sys.systemId);

        items.push({
            label: `${getSystemIcon(sys)} ${sys.designation}`,
            description: `${gauge} ${pct}%`,
            detail: trend !== '?' ? `Trend: ${trend}` : undefined
        });
    }

    // Section: Actions
    items.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator
    });

    items.push({
        label: '$(sync) Refresh Telemetry',
        description: 'Perform manual scan'
    });

    items.push({
        label: '$(graph-line) View Trends',
        description: 'Analyze usage patterns'
    });

    items.push({
        label: '$(bell) Configure Alerts',
        description: 'Set notification thresholds'
    });

    const selected = await vscode.window.showQuickPick(items, {
        title: 'AG Telemetry - Mission Briefing',
        placeHolder: 'Select a system or action'
    });

    if (selected) {
        if (selected.label.includes('Refresh')) {
            vscode.commands.executeCommand('agTelemetry.refreshTelemetry');
        } else if (selected.label.includes('Trends')) {
            vscode.commands.executeCommand('agTelemetry.viewTrends');
        } else if (selected.label.includes('Alerts')) {
            vscode.commands.executeCommand('agTelemetry.configureAlerts');
        }
    }
}

/**
 * Show alert configuration
 */
async function showAlertConfiguration(): Promise<void> {
    const config = loadConfig();

    const items: vscode.QuickPickItem[] = [
        {
            label: `$(bell) Notifications: ${config.enableNotifications ? 'Enabled' : 'Disabled'}`,
            description: 'Toggle notification alerts'
        },
        {
            label: `$(warning) Caution Threshold: ${config.alertThresholds.caution}%`,
            description: 'Set caution level'
        },
        {
            label: `$(flame) Warning Threshold: ${config.alertThresholds.warning}%`,
            description: 'Set warning level'
        },
        {
            label: `$(error) Critical Threshold: ${config.alertThresholds.critical}%`,
            description: 'Set critical level'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        title: 'AG Telemetry - Alert Configuration',
        placeHolder: 'Select a setting to modify'
    });

    if (!selected) return;

    if (selected.label.includes('Notifications')) {
        const newValue = !config.enableNotifications;
        await vscode.workspace.getConfiguration('agTelemetry')
            .update('enableNotifications', newValue, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(
            `AG Telemetry: Notifications ${newValue ? 'enabled' : 'disabled'}`
        );
    } else if (selected.label.includes('Caution')) {
        await updateThreshold('caution', config.alertThresholds);
    } else if (selected.label.includes('Warning')) {
        await updateThreshold('warning', config.alertThresholds);
    } else if (selected.label.includes('Critical')) {
        await updateThreshold('critical', config.alertThresholds);
    }
}

/**
 * Update a specific threshold
 * Validates that the new threshold maintains proper ordering
 */
async function updateThreshold(
    level: 'caution' | 'warning' | 'critical',
    current: AlertThresholds
): Promise<void> {
    const input = await vscode.window.showInputBox({
        title: `Set ${level} threshold`,
        prompt: 'Enter percentage (1-100). Must maintain order: caution > warning > critical',
        value: current[level].toString(),
        validateInput: (value) => {
            const num = parseInt(value, 10);
            if (isNaN(num) || num < 1 || num > 100) {
                return 'Please enter a number between 1 and 100';
            }

            // Validate ordering with the proposed new value
            const proposed = { ...current, [level]: num };
            if (!isValidAlertThresholds(proposed)) {
                return `Invalid ordering. Thresholds must satisfy: caution (${level === 'caution' ? num : current.caution}) > warning (${level === 'warning' ? num : current.warning}) > critical (${level === 'critical' ? num : current.critical})`;
            }

            return null;
        }
    });

    if (input) {
        const newThresholds = { ...current, [level]: parseInt(input, 10) };
        await vscode.workspace.getConfiguration('agTelemetry')
            .update('alertThresholds', newThresholds, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(
            `AG Telemetry: ${level} threshold set to ${input}%`
        );
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
        output.appendLine(`   ✓ CSRF Token: ${diagnostic.uplink.securityToken ? 'Present (' + diagnostic.uplink.securityToken.substring(0, 8) + '...)' : 'Missing'}`);
    } else {
        output.appendLine('   ✗ Status: DISCONNECTED');
        output.appendLine('   ✗ No active uplink connection');
    }
    output.appendLine('');

    // Section 2: Failure Tracking
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('2. FAILURE TRACKING');
    output.appendLine('───────────────────────────────────────────────────────');

    if (diagnostic.consecutiveFailures === 0) {
        output.appendLine('   ✓ Consecutive Failures: 0');
        output.appendLine('   ✓ System operating normally');
    } else {
        output.appendLine(`   ⚠ Consecutive Failures: ${diagnostic.consecutiveFailures}`);
        if (diagnostic.consecutiveFailures >= 3) {
            output.appendLine('   ✗ Threshold exceeded - API may have changed');
        }
    }
    output.appendLine('');

    // Section 3: Schema Validation
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('3. SCHEMA VALIDATION');
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

    // Section 4: Telemetry Data
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('4. TELEMETRY DATA');
    output.appendLine('───────────────────────────────────────────────────────');

    if (diagnostic.hasSnapshot) {
        output.appendLine(`   ✓ Data Available: YES`);
        output.appendLine(`   ✓ Systems Detected: ${diagnostic.systemCount}`);

        const snapshot = telemetryService.getLastSnapshot();
        if (snapshot && snapshot.systems.length > 0) {
            output.appendLine('   Systems:');
            for (const sys of snapshot.systems) {
                const pct = Math.round(sys.fuelLevel * 100);
                output.appendLine(`     - ${sys.designation}: ${pct}% (${sys.readiness})`);
            }
        }
    } else {
        output.appendLine('   ✗ Data Available: NO');
        output.appendLine('   ✗ No telemetry snapshot captured yet');
    }
    output.appendLine('');

    // Section 5: Raw Response Sample
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('5. RAW API RESPONSE (SAMPLE)');
    output.appendLine('───────────────────────────────────────────────────────');

    if (diagnostic.lastRawResponseSample) {
        output.appendLine(diagnostic.lastRawResponseSample);
    } else {
        output.appendLine('   No API response captured yet');
    }
    output.appendLine('');

    // Section 6: Expected API Structure
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('6. EXPECTED API STRUCTURE');
    output.appendLine('───────────────────────────────────────────────────────');
    output.appendLine('   {');
    output.appendLine('     "userStatus": {');
    output.appendLine('       "cascadeModelConfigData": {');
    output.appendLine('         "clientModelConfigs": [');
    output.appendLine('           {');
    output.appendLine('             "label": "model-name",');
    output.appendLine('             "modelOrAlias": { "model": "model-id" },');
    output.appendLine('             "quotaInfo": {');
    output.appendLine('               "remainingFraction": 0.75,');
    output.appendLine('               "resetTime": "ISO-8601-timestamp"');
    output.appendLine('             }');
    output.appendLine('           }');
    output.appendLine('         ]');
    output.appendLine('       }');
    output.appendLine('     }');
    output.appendLine('   }');
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

    // Offer actions
    const action = await vscode.window.showInformationMessage(
        'AG Telemetry: Diagnostics complete. View the output panel for details.',
        'Retry Connection',
        'Report Issue',
        'Close'
    );

    if (action === 'Retry Connection') {
        telemetryService.resetFailureCounter();
        vscode.commands.executeCommand('agTelemetry.establishLink');
    } else if (action === 'Report Issue') {
        const issueUrl = 'https://github.com/llegomark/ag-telemetry/issues/new?' +
            'template=bug_report.md&title=' +
            encodeURIComponent('[Diagnostic] API Compatibility Issue');
        vscode.env.openExternal(vscode.Uri.parse(issueUrl));
    }
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
 * Handle consecutive failure events with user feedback
 */
function handleConsecutiveFailures(failureCount: number): void {
    vscode.window.showErrorMessage(
        `AG Telemetry: ${failureCount} consecutive failures. The Antigravity API may have changed.`,
        'Run Diagnostics',
        'Report Issue',
        'Retry'
    ).then(action => {
        if (action === 'Run Diagnostics') {
            vscode.commands.executeCommand('agTelemetry.runDiagnostics');
        } else if (action === 'Report Issue') {
            const issueUrl = 'https://github.com/llegomark/ag-telemetry/issues/new?' +
                'template=bug_report.md&title=' +
                encodeURIComponent('[API Change] Consecutive Failures Detected');
            vscode.env.openExternal(vscode.Uri.parse(issueUrl));
        } else if (action === 'Retry') {
            telemetryService.resetFailureCounter();
            vscode.commands.executeCommand('agTelemetry.establishLink');
        }
    });
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    telemetryService?.dispose();
    flightDeck?.dispose();
    historyTracker?.dispose();
}

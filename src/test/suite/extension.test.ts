/**
 * AG Telemetry - Extension Integration Tests
 * Tests for extension activation and command registration
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Integration Tests', function () {
    // Increase timeout for VS Code operations
    this.timeout(30000);

    before(async () => {
        vscode.window.showInformationMessage('Starting AG Telemetry integration tests');
    });

    it('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('llegomark.ag-telemetry');
        assert.ok(extension, 'Extension should be installed');
    });

    it('Extension should activate', async function () {
        const extension = vscode.extensions.getExtension('llegomark.ag-telemetry');
        if (extension) {
            await extension.activate();
            assert.strictEqual(extension.isActive, true, 'Extension should be active');
        }
    });

    it('All commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);

        const expectedCommands = [
            'agTelemetry.refreshTelemetry',
            'agTelemetry.missionBriefing',
            'agTelemetry.viewTrends',
            'agTelemetry.configureAlerts',
            'agTelemetry.establishLink'
        ];

        for (const cmd of expectedCommands) {
            assert.ok(
                commands.includes(cmd),
                `Command "${cmd}" should be registered`
            );
        }
    });

    it('Configuration should have expected properties', () => {
        const config = vscode.workspace.getConfiguration('agTelemetry');

        // Check that configuration properties exist
        assert.notStrictEqual(
            config.get('scanInterval'),
            undefined,
            'scanInterval should be defined'
        );
        assert.notStrictEqual(
            config.get('alertThresholds'),
            undefined,
            'alertThresholds should be defined'
        );
        assert.notStrictEqual(
            config.get('enableNotifications'),
            undefined,
            'enableNotifications should be defined'
        );
        assert.notStrictEqual(
            config.get('flightDeckMode'),
            undefined,
            'flightDeckMode should be defined'
        );
        assert.notStrictEqual(
            config.get('trackHistory'),
            undefined,
            'trackHistory should be defined'
        );
    });

    it('Default configuration values should be correct', () => {
        const config = vscode.workspace.getConfiguration('agTelemetry');

        assert.strictEqual(config.get('scanInterval'), 90, 'Default scan interval should be 90');
        assert.strictEqual(config.get('enableNotifications'), true, 'Notifications should be enabled by default');
        assert.strictEqual(config.get('flightDeckMode'), 'compact', 'Default flight deck mode should be compact');
        assert.strictEqual(config.get('trackHistory'), true, 'History tracking should be enabled by default');

        const thresholds = config.get<{ caution: number; warning: number; critical: number }>('alertThresholds');
        assert.strictEqual(thresholds?.caution, 40, 'Default caution threshold should be 40');
        assert.strictEqual(thresholds?.warning, 20, 'Default warning threshold should be 20');
        assert.strictEqual(thresholds?.critical, 5, 'Default critical threshold should be 5');
    });
});

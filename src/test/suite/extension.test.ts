/**
 * AG Telemetry - Extension Integration Tests
 * Tests for extension activation and command registration
 * Simplified version for v2.0.0
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

        // Simplified command list for v2.0.0
        const expectedCommands = [
            'agTelemetry.refreshTelemetry',
            'agTelemetry.missionBriefing',
            'agTelemetry.establishLink',
            'agTelemetry.runDiagnostics'
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

        // Only scanInterval remains in v2.0.0
        assert.notStrictEqual(
            config.get('scanInterval'),
            undefined,
            'scanInterval should be defined'
        );
    });

    it('Default configuration values should be correct', () => {
        const config = vscode.workspace.getConfiguration('agTelemetry');

        assert.strictEqual(config.get('scanInterval'), 90, 'Default scan interval should be 90');
    });
});

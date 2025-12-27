/**
 * AG Telemetry - Test Runner Entry Point
 * Launches VS Code with the extension and runs integration tests
 */

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the test suite runner script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, unzip it, and run the integration tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions', // Disable other extensions for clean testing
                '--disable-gpu' // Faster in CI environments
            ]
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();

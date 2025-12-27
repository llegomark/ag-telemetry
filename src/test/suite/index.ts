/**
 * AG Telemetry - Test Suite Index
 * Loads and runs all integration tests within VS Code
 */

import * as path from 'path';
import Mocha from 'mocha';
import * as glob from 'glob';

export function run(): Promise<void> {
    // Create the Mocha test runner
    const mocha = new Mocha({
        ui: 'bdd',
        color: true,
        timeout: 10000 // 10 second timeout for VS Code API calls
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise((resolve, reject) => {
        // Find all test files
        const testFiles = glob.sync('**/*.test.js', { cwd: testsRoot });

        // Add files to the test suite
        testFiles.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

        try {
            // Run the mocha tests
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(`${failures} tests failed.`));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}

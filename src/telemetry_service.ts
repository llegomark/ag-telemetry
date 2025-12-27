/**
 * AG Telemetry - Telemetry Service
 * Manages uplink connection and data acquisition from Antigravity systems
 */

import * as https from 'https';
import { IncomingMessage } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import {
    FuelSystem,
    ReadinessLevel,
    SystemClass,
    UplinkStatus,
    TelemetrySnapshot,
    ServerTelemetryResponse,
    TelemetryEvent,
    TelemetryEventType,
    AlertThresholds
} from './types';
import { isValidCsrfToken, isValidPid, normalizeScanInterval } from './security';

const execAsync = promisify(exec);

type EventCallback = (event: TelemetryEvent) => void;

/**
 * Result of schema validation for API responses
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    receivedKeys: string[];
}

/**
 * Telemetry Service - Core communication module
 * Establishes and maintains uplink with Antigravity systems
 */
export class TelemetryService {
    private uplink: UplinkStatus = {
        isConnected: false,
        signalStrength: 0
    };

    private eventSubscribers: Set<EventCallback> = new Set();
    private scanTimer?: NodeJS.Timeout;
    private lastSnapshot?: TelemetrySnapshot;

    /** Last raw API response for debugging */
    private lastRawResponse?: unknown;

    /** Last validation result for diagnostics */
    private lastValidation?: ValidationResult;

    /** Consecutive failure count for user feedback */
    private consecutiveFailures: number = 0;

    /** Threshold for showing user feedback about failures */
    private static readonly FAILURE_THRESHOLD = 3;
    private static readonly MAX_SCAN_PORTS = 32;
    private static readonly MAX_RESPONSE_BYTES = 1024 * 1024;
    private static readonly MAX_PROBE_BYTES = 64 * 1024;
    private static readonly MAX_SYSTEMS = 200;
    private static readonly MAX_LABEL_LENGTH = 128;
    private static readonly MAX_SYSTEM_ID_LENGTH = 256;

    constructor(private thresholds: AlertThresholds) {}

    /**
     * Subscribe to telemetry events
     */
    subscribe(callback: EventCallback): () => void {
        this.eventSubscribers.add(callback);
        return () => this.eventSubscribers.delete(callback);
    }

    /**
     * Emit event to all subscribers
     */
    private emit(type: TelemetryEventType, payload?: unknown): void {
        const event: TelemetryEvent = {
            type,
            timestamp: Date.now(),
            payload
        };
        this.eventSubscribers.forEach(cb => cb(event));
    }

    private static isValidPort(port: number): boolean {
        return Number.isInteger(port) && port > 0 && port < 65536;
    }

    private readLimitedResponse(res: IncomingMessage, maxBytes: number): Promise<string | null> {
        return new Promise(resolve => {
            let data = '';
            let size = 0;
            let resolved = false;

            const finish = (value: string | null) => {
                if (!resolved) {
                    resolved = true;
                    resolve(value);
                }
            };

            res.on('data', chunk => {
                const chunkSize = typeof chunk === 'string'
                    ? Buffer.byteLength(chunk)
                    : chunk.length;
                size += chunkSize;
                if (size > maxBytes) {
                    res.destroy();
                    finish(null);
                    return;
                }
                data += chunk;
            });

            res.on('end', () => finish(data));
            res.on('error', () => finish(null));
        });
    }

    /**
     * Establish uplink connection to Antigravity systems
     */
    async establishUplink(): Promise<boolean> {
        this.emit('scan-started');

        try {
            const processData = await this.locateAntigravityBeacon();
            if (!processData) {
                this.uplink = { isConnected: false, signalStrength: 0 };
                this.emit('uplink-lost');
                return false;
            }

            const { pid, token } = processData;
            const activePort = await this.scanFrequencies(pid, token);

            if (!activePort) {
                this.uplink = { isConnected: false, signalStrength: 0 };
                this.emit('uplink-lost');
                return false;
            }

            this.uplink = {
                isConnected: true,
                port: activePort,
                securityToken: token,
                lastContact: Date.now(),
                signalStrength: 100
            };

            this.emit('uplink-established', { port: activePort });
            return true;
        } catch (err) {
            this.emit('error', err);
            return false;
        }
    }

    /**
     * Locate the Antigravity process beacon
     */
    private async locateAntigravityBeacon(): Promise<{ pid: number; token: string } | null> {
        const os = platform();
        let output: string;

        try {
            if (os === 'win32') {
                const { stdout } = await execAsync(
                    'powershell -Command "Get-CimInstance Win32_Process | ' +
                    'Where-Object {$_.Name -like \'*language_server*\'} | ' +
                    'Select-Object ProcessId,CommandLine | ConvertTo-Json"',
                    { timeout: 8000 }
                );
                output = stdout;
            } else {
                const { stdout } = await execAsync(
                    'ps -axo pid,args | grep -i language_server | grep -v grep',
                    { timeout: 8000 }
                );
                output = stdout;
            }
        } catch {
            return null;
        }

        return this.extractBeaconData(output, os);
    }

    /**
     * Extract process ID and security token from beacon data
     */
    private extractBeaconData(raw: string, os: string): { pid: number; token: string } | null {
        if (!raw.trim()) return null;

        const tokenPattern = /--csrf[_-]?token[=\s]+([a-f0-9-]+)/ig;
        const extractToken = (text: string): string | null => {
            tokenPattern.lastIndex = 0;
            let match: RegExpExecArray | null;
            let token: string | null = null;
            while ((match = tokenPattern.exec(text)) !== null) {
                const candidate = match[1];
                if (isValidCsrfToken(candidate)) {
                    token = candidate;
                }
            }
            return token;
        };

        if (os === 'win32') {
            try {
                const data = JSON.parse(raw);
                const processes = Array.isArray(data) ? data : [data];

                for (const proc of processes) {
                    const cmdLine = typeof proc.CommandLine === 'string' ? proc.CommandLine : '';
                    const token = extractToken(cmdLine);
                    const pid = Number(proc.ProcessId);
                    if (token && isValidPid(pid)) {
                        return { pid, token };
                    }
                }
            } catch {
                return null;
            }
        } else {
            const lines = raw.trim().split('\n');
            for (const line of lines) {
                const token = extractToken(line);
                if (!token) {
                    continue;
                }
                const pidMatch = line.trim().match(/^(\d+)/);
                if (pidMatch) {
                    const pid = parseInt(pidMatch[1], 10);
                    if (isValidPid(pid)) {
                        return { pid, token };
                    }
                }
            }
        }

        return null;
    }

    /**
     * Scan communication frequencies (ports) for active uplink
     */
    private async scanFrequencies(pid: number, token: string): Promise<number | null> {
        const frequencies = await this.detectActiveFrequencies(pid);

        for (const freq of frequencies) {
            const isActive = await this.probeFrequency(freq, token);
            if (isActive) return freq;
        }

        return null;
    }

    /**
     * Detect active communication frequencies for process
     */
    private async detectActiveFrequencies(pid: number): Promise<number[]> {
        // Defense in depth: validate PID even though it comes from trusted OS output
        if (!isValidPid(pid)) {
            return [];
        }

        const os = platform();
        let output: string;

        try {
            if (os === 'win32') {
                const { stdout } = await execAsync(
                    `powershell -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen | ` +
                    `Select-Object -ExpandProperty LocalPort"`,
                    { timeout: 5000 }
                );
                output = stdout;
            } else if (os === 'darwin') {
                const { stdout } = await execAsync(
                    `lsof -iTCP -sTCP:LISTEN -a -p ${pid} -Fn | grep '^n' | sed 's/n\\*://'`,
                    { timeout: 5000 }
                );
                output = stdout;
            } else {
                const { stdout } = await execAsync(
                    `ss -tlnp 2>/dev/null | grep "pid=${pid}" | awk '{print $4}' | rev | cut -d: -f1 | rev`,
                    { timeout: 5000 }
                );
                output = stdout;
            }
        } catch {
            return [];
        }

        const ports = new Set<number>();
        for (const line of output.split('\n')) {
            const port = parseInt(line.trim(), 10);
            if (TelemetryService.isValidPort(port)) {
                ports.add(port);
            }
        }

        return Array.from(ports)
            .sort((a, b) => a - b)
            .slice(0, TelemetryService.MAX_SCAN_PORTS);
    }

    /**
     * Probe a frequency to verify uplink capability
     */
    private probeFrequency(port: number, token: string): Promise<boolean> {
        if (!TelemetryService.isValidPort(port) || !isValidCsrfToken(token)) {
            return Promise.resolve(false);
        }

        return new Promise(resolve => {
            const payload = JSON.stringify({
                context: { properties: { ide: 'antigravity' } }
            });

            const req = https.request({
                hostname: '127.0.0.1',
                port,
                path: '/exa.language_server_pb.LanguageServerService/GetUnleashData',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': token
                },
                // SECURITY NOTE: rejectUnauthorized is disabled because the Antigravity
                // language server uses a self-signed certificate for localhost communication.
                // This is acceptable because:
                // 1. Communication is strictly localhost (127.0.0.1), not DNS-resolvable
                // 2. CSRF token provides request authenticity verification
                // 3. An attacker with local machine access has already compromised security
                rejectUnauthorized: false,
                timeout: 3000
            }, res => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(false);
                    return;
                }

                this.readLimitedResponse(res, TelemetryService.MAX_PROBE_BYTES).then(body => {
                    resolve(body !== null);
                });
            });

            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Acquire current telemetry from Antigravity systems
     */
    async acquireTelemetry(): Promise<TelemetrySnapshot | null> {
        if (!this.uplink.isConnected || !this.uplink.port || !this.uplink.securityToken) {
            const reconnected = await this.establishUplink();
            if (!reconnected) {
                this.trackFailure('uplink-failed');
                return null;
            }
        }

        this.emit('scan-started');

        try {
            const rawData = await this.transmitQuery();

            // Store raw response for diagnostics
            this.lastRawResponse = rawData;

            if (!rawData) {
                this.degradeSignal();
                this.trackFailure('no-response');
                return null;
            }

            // Validate response schema
            const validation = this.validateServerResponse(rawData);
            this.lastValidation = validation;

            if (!validation.valid) {
                console.error('[AG Telemetry] Schema validation failed:', validation.errors);
                this.emit('error', {
                    type: 'schema-validation-failed',
                    message: 'API response schema validation failed',
                    errors: validation.errors,
                    receivedKeys: validation.receivedKeys
                });
                this.trackFailure('schema-invalid');
                this.degradeSignal();
                return null;
            }

            // Log warnings if any
            if (validation.warnings.length > 0) {
                console.warn('[AG Telemetry] Schema validation warnings:', validation.warnings);
            }

            const systems = this.processTelemetryData(rawData);
            const snapshot: TelemetrySnapshot = {
                timestamp: Date.now(),
                systems,
                overallReadiness: this.assessOverallReadiness(systems),
                activeAlerts: systems.filter(s =>
                    s.readiness === ReadinessLevel.WARNING ||
                    s.readiness === ReadinessLevel.CRITICAL
                ).length
            };

            this.uplink.lastContact = Date.now();
            this.uplink.signalStrength = 100;
            this.lastSnapshot = snapshot;

            // Reset failure counter on success
            this.consecutiveFailures = 0;

            this.emit('telemetry-received', snapshot);
            this.emit('scan-completed');

            return snapshot;
        } catch (err) {
            this.degradeSignal();
            this.trackFailure('exception');
            this.emit('error', err);
            return null;
        }
    }

    /**
     * Track consecutive failures and emit threshold event
     */
    private trackFailure(reason: string): void {
        this.consecutiveFailures++;
        console.warn(
            `[AG Telemetry] Failure #${this.consecutiveFailures}: ${reason}`
        );

        if (this.consecutiveFailures === TelemetryService.FAILURE_THRESHOLD) {
            this.emit('error', {
                type: 'consecutive-failures',
                message: `${this.consecutiveFailures} consecutive failures detected`,
                reason,
                failureCount: this.consecutiveFailures
            });
        }
    }

    /**
     * Transmit query to acquire system status
     */
    private transmitQuery(): Promise<ServerTelemetryResponse | null> {
        const port = this.uplink.port;
        const token = this.uplink.securityToken ?? '';

        if (!TelemetryService.isValidPort(port ?? 0) || !isValidCsrfToken(token)) {
            return Promise.resolve(null);
        }

        return new Promise(resolve => {
            const payload = JSON.stringify({
                metadata: { ideName: 'antigravity' }
            });

            const req = https.request({
                hostname: '127.0.0.1',
                port,
                path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': token
                },
                // SECURITY NOTE: rejectUnauthorized is disabled for localhost self-signed cert.
                // See probeFrequency() for detailed security rationale.
                rejectUnauthorized: false,
                timeout: 5000
            }, res => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(null);
                    return;
                }

                this.readLimitedResponse(res, TelemetryService.MAX_RESPONSE_BYTES).then(body => {
                    if (!body) {
                        resolve(null);
                        return;
                    }
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => resolve(null));
            req.on('timeout', () => {
                req.destroy();
                resolve(null);
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Process raw telemetry into FuelSystem array
     * Validates and sanitizes server response fields to prevent DoS/rendering issues
     */
    private processTelemetryData(raw: ServerTelemetryResponse): FuelSystem[] {
        const configs = raw.userStatus?.cascadeModelConfigData?.clientModelConfigs ?? [];
        const systems: FuelSystem[] = [];

        for (const config of configs) {
            if (systems.length >= TelemetryService.MAX_SYSTEMS) {
                break;
            }

            if (!config.quotaInfo) continue;

            // Validate label is a non-empty string
            const rawLabel = config.label;
            if (typeof rawLabel !== 'string') {
                continue;
            }
            const trimmedLabel = rawLabel.trim();
            if (trimmedLabel.length === 0) {
                continue; // Skip invalid entries
            }

            const safeLabel = trimmedLabel.length > TelemetryService.MAX_LABEL_LENGTH
                ? trimmedLabel.slice(0, TelemetryService.MAX_LABEL_LENGTH)
                : trimmedLabel;

            // Validate and clamp remainingFraction to [0, 1]
            const rawFraction = config.quotaInfo.remainingFraction;
            if (typeof rawFraction !== 'number' || !Number.isFinite(rawFraction)) {
                continue; // Skip entries with invalid fuel level
            }
            const fuelLevel = Math.max(0, Math.min(1, rawFraction));

            // Validate systemId
            const rawSystemId = config.modelOrAlias?.model ?? trimmedLabel;
            if (typeof rawSystemId !== 'string') {
                continue;
            }
            const trimmedSystemId = rawSystemId.trim();
            if (trimmedSystemId.length === 0 ||
                trimmedSystemId.length > TelemetryService.MAX_SYSTEM_ID_LENGTH) {
                continue;
            }

            const resetTime = typeof config.quotaInfo.resetTime === 'string'
                ? config.quotaInfo.resetTime
                : undefined;

            const system: FuelSystem = {
                systemId: trimmedSystemId,
                designation: this.formatDesignation(safeLabel),
                fuelLevel,
                replenishmentEta: resetTime,
                readiness: this.assessReadiness(fuelLevel),
                systemClass: this.classifySystem(safeLabel),
                isOnline: true
            };

            systems.push(system);
        }

        return systems.sort((a, b) => a.fuelLevel - b.fuelLevel);
    }

    /**
     * Validate server response schema
     * Checks for expected data structures and logs discrepancies
     */
    private validateServerResponse(response: unknown): ValidationResult {
        const result: ValidationResult = {
            valid: true,
            errors: [],
            warnings: [],
            receivedKeys: []
        };

        // Check for null/undefined response
        if (!response || typeof response !== 'object') {
            result.valid = false;
            result.errors.push('Response is null, undefined, or not an object');
            return result;
        }

        const data = response as Record<string, unknown>;
        result.receivedKeys = Object.keys(data);

        // Check for expected primary structure
        const hasUserStatus = data.userStatus && typeof data.userStatus === 'object';

        if (!hasUserStatus) {
            result.valid = false;
            result.errors.push(
                `Missing 'userStatus' field. Received keys: [${result.receivedKeys.join(', ')}]`
            );
            return result;
        }

        // Check for cascadeModelConfigData
        const userStatus = data.userStatus as Record<string, unknown>;
        const hasCascade = userStatus.cascadeModelConfigData &&
            typeof userStatus.cascadeModelConfigData === 'object';

        if (!hasCascade) {
            result.valid = false;
            result.errors.push(
                `Missing 'cascadeModelConfigData' in userStatus. ` +
                `userStatus keys: [${Object.keys(userStatus).join(', ')}]`
            );
            return result;
        }

        // Check for clientModelConfigs array
        const cascade = userStatus.cascadeModelConfigData as Record<string, unknown>;
        const hasConfigs = Array.isArray(cascade.clientModelConfigs);

        if (!hasConfigs) {
            result.valid = false;
            result.errors.push(
                `Missing or invalid 'clientModelConfigs' array. ` +
                `cascadeModelConfigData keys: [${Object.keys(cascade).join(', ')}]`
            );
            return result;
        }

        const configs = cascade.clientModelConfigs as unknown[];

        // Validate individual config structure
        if (configs.length > 0) {
            const sample = configs[0];
            // Guard against null/undefined array elements
            if (sample && typeof sample === 'object') {
                const sampleObj = sample as Record<string, unknown>;
                if (!sampleObj.label && !sampleObj.quotaInfo) {
                    result.warnings.push(
                        `Config structure may have changed. ` +
                        `Sample config keys: [${Object.keys(sampleObj).join(', ')}]`
                    );
                }
            } else if (sample === null || sample === undefined) {
                result.warnings.push('First config element is null or undefined');
            }
        }

        // Check if configs array is empty (could be valid but worth noting)
        if (configs.length === 0) {
            result.warnings.push('clientModelConfigs array is empty - no models configured');
        }

        return result;
    }

    /**
     * Format model label into mission-style designation
     */
    private formatDesignation(label: string): string {
        return label
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();
    }

    /**
     * Classify system based on label patterns
     */
    private classifySystem(label: string): SystemClass {
        const lower = label.toLowerCase();

        if (lower.includes('flash')) return SystemClass.GEMINI_FLASH;
        if (lower.includes('gemini') || lower.includes('pro')) return SystemClass.GEMINI_PRO;
        if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus')) return SystemClass.CLAUDE;
        if (lower.includes('gpt') || lower.includes('oss')) return SystemClass.GPT;

        return SystemClass.EXPERIMENTAL;
    }

    /**
     * Assess readiness level based on fuel
     */
    private assessReadiness(fuelLevel: number): ReadinessLevel {
        const percentage = fuelLevel * 100;

        if (percentage <= this.thresholds.critical) return ReadinessLevel.CRITICAL;
        if (percentage <= this.thresholds.warning) return ReadinessLevel.WARNING;
        if (percentage <= this.thresholds.caution) return ReadinessLevel.CAUTION;

        return ReadinessLevel.NOMINAL;
    }

    /**
     * Assess overall fleet readiness
     */
    private assessOverallReadiness(systems: FuelSystem[]): ReadinessLevel {
        if (systems.length === 0) return ReadinessLevel.OFFLINE;

        const criticalCount = systems.filter(s => s.readiness === ReadinessLevel.CRITICAL).length;
        const warningCount = systems.filter(s => s.readiness === ReadinessLevel.WARNING).length;

        if (criticalCount > 0) return ReadinessLevel.CRITICAL;
        if (warningCount >= systems.length / 2) return ReadinessLevel.WARNING;
        if (warningCount > 0) return ReadinessLevel.CAUTION;

        return ReadinessLevel.NOMINAL;
    }

    /**
     * Degrade signal strength on communication issues
     */
    private degradeSignal(): void {
        this.uplink.signalStrength = Math.max(0, this.uplink.signalStrength - 25);

        if (this.uplink.signalStrength === 0) {
            this.uplink.isConnected = false;
            this.emit('uplink-lost');
        }
    }

    /**
     * Start periodic telemetry scans
     */
    startPeriodicScans(intervalSeconds: number): void {
        this.stopPeriodicScans();

        const normalized = normalizeScanInterval(intervalSeconds, 90);
        const interval = normalized * 1000;
        this.scanTimer = setInterval(() => {
            this.acquireTelemetry();
        }, interval);
    }

    /**
     * Stop periodic scans
     */
    stopPeriodicScans(): void {
        if (this.scanTimer) {
            clearInterval(this.scanTimer);
            this.scanTimer = undefined;
        }
    }

    /**
     * Get current uplink status
     */
    getUplinkStatus(): UplinkStatus {
        return { ...this.uplink };
    }

    /**
     * Get last telemetry snapshot
     */
    getLastSnapshot(): TelemetrySnapshot | undefined {
        return this.lastSnapshot;
    }

    /**
     * Update alert thresholds
     */
    updateThresholds(thresholds: AlertThresholds): void {
        this.thresholds = thresholds;
    }

    /**
     * Get last raw API response for debugging
     */
    getLastRawResponse(): unknown {
        return this.lastRawResponse;
    }

    /**
     * Get last validation result for diagnostics
     */
    getLastValidation(): ValidationResult | undefined {
        return this.lastValidation;
    }

    /**
     * Get consecutive failure count
     */
    getConsecutiveFailures(): number {
        return this.consecutiveFailures;
    }

    /**
     * Get comprehensive diagnostic information
     */
    getDiagnosticInfo(): {
        uplink: UplinkStatus;
        consecutiveFailures: number;
        lastValidation: ValidationResult | undefined;
        lastRawResponseSample: string | undefined;
        hasSnapshot: boolean;
        systemCount: number;
    } {
        let rawSample: string | undefined;
        if (this.lastRawResponse) {
            try {
                const full = JSON.stringify(this.lastRawResponse, null, 2);
                rawSample = full.length > 1000 ? full.substring(0, 1000) + '...' : full;
            } catch {
                rawSample = '[Unable to serialize response]';
            }
        }

        return {
            uplink: { ...this.uplink },
            consecutiveFailures: this.consecutiveFailures,
            lastValidation: this.lastValidation,
            lastRawResponseSample: rawSample,
            hasSnapshot: !!this.lastSnapshot,
            systemCount: this.lastSnapshot?.systems.length ?? 0
        };
    }

    /**
     * Reset failure counter (for manual retry)
     */
    resetFailureCounter(): void {
        this.consecutiveFailures = 0;
    }

    /**
     * Dispose resources
     */
    dispose(): void {
        this.stopPeriodicScans();
        this.eventSubscribers.clear();
    }
}

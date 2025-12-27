/**
 * AG Telemetry - Telemetry Service
 * Manages uplink connection and data acquisition from Antigravity systems
 */

import * as https from 'https';
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
import { isValidPid } from './security';

const execAsync = promisify(exec);

type EventCallback = (event: TelemetryEvent) => void;

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

        const tokenPattern = /--csrf[_-]?token[=\s]+([a-f0-9-]+)/i;

        if (os === 'win32') {
            try {
                const data = JSON.parse(raw);
                const processes = Array.isArray(data) ? data : [data];

                for (const proc of processes) {
                    const cmdLine = proc.CommandLine || '';
                    const match = cmdLine.match(tokenPattern);
                    if (match && proc.ProcessId) {
                        return { pid: proc.ProcessId, token: match[1] };
                    }
                }
            } catch {
                return null;
            }
        } else {
            const lines = raw.trim().split('\n');
            for (const line of lines) {
                const match = line.match(tokenPattern);
                if (match) {
                    const pidMatch = line.trim().match(/^(\d+)/);
                    if (pidMatch) {
                        return { pid: parseInt(pidMatch[1], 10), token: match[1] };
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

        const frequencies: number[] = [];
        for (const line of output.split('\n')) {
            const port = parseInt(line.trim(), 10);
            if (!isNaN(port) && port > 0 && port < 65536) {
                frequencies.push(port);
            }
        }

        return frequencies;
    }

    /**
     * Probe a frequency to verify uplink capability
     */
    private probeFrequency(port: number, token: string): Promise<boolean> {
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
                resolve(res.statusCode === 200);
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
            if (!reconnected) return null;
        }

        this.emit('scan-started');

        try {
            const rawData = await this.transmitQuery();
            if (!rawData) {
                this.degradeSignal();
                return null;
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

            this.emit('telemetry-received', snapshot);
            this.emit('scan-completed');

            return snapshot;
        } catch (err) {
            this.degradeSignal();
            this.emit('error', err);
            return null;
        }
    }

    /**
     * Transmit query to acquire system status
     */
    private transmitQuery(): Promise<ServerTelemetryResponse | null> {
        return new Promise(resolve => {
            const payload = JSON.stringify({
                metadata: { ideName: 'antigravity' }
            });

            const req = https.request({
                hostname: '127.0.0.1',
                port: this.uplink.port,
                path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Connect-Protocol-Version': '1',
                    'X-Codeium-Csrf-Token': this.uplink.securityToken!
                },
                // SECURITY NOTE: rejectUnauthorized is disabled for localhost self-signed cert.
                // See probeFrequency() for detailed security rationale.
                rejectUnauthorized: false,
                timeout: 5000
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
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
     */
    private processTelemetryData(raw: ServerTelemetryResponse): FuelSystem[] {
        const configs = raw.userStatus?.cascadeModelConfigData?.clientModelConfigs ?? [];
        const systems: FuelSystem[] = [];

        for (const config of configs) {
            if (!config.quotaInfo) continue;

            const fuelLevel = config.quotaInfo.remainingFraction;
            const system: FuelSystem = {
                systemId: config.modelOrAlias?.model ?? config.label,
                designation: this.formatDesignation(config.label),
                fuelLevel,
                replenishmentEta: config.quotaInfo.resetTime,
                readiness: this.assessReadiness(fuelLevel),
                systemClass: this.classifySystem(config.label),
                isOnline: true
            };

            systems.push(system);
        }

        return systems.sort((a, b) => a.fuelLevel - b.fuelLevel);
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

        const interval = Math.max(30, intervalSeconds) * 1000;
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
     * Dispose resources
     */
    dispose(): void {
        this.stopPeriodicScans();
        this.eventSubscribers.clear();
    }
}

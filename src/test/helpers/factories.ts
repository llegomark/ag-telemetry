/**
 * AG Telemetry - Test Data Factories
 * Factory functions for creating test data with sensible defaults
 */

import {
    FuelSystem,
    ReadinessLevel,
    SystemClass,
    TelemetrySnapshot,
    TelemetryAlert,
    UplinkStatus,
    AlertThresholds,
    TrendDataPoint,
    ServerTelemetryResponse,
    ModelConfig
} from '../../types';

/**
 * Default alert thresholds for testing
 */
export const DEFAULT_THRESHOLDS: AlertThresholds = {
    caution: 40,
    warning: 20,
    critical: 5
};

/**
 * Create a FuelSystem with optional overrides
 */
export function createFuelSystem(overrides: Partial<FuelSystem> = {}): FuelSystem {
    return {
        systemId: 'test-model-1',
        designation: 'Test Model 1',
        fuelLevel: 0.75,
        replenishmentEta: undefined,
        readiness: ReadinessLevel.NOMINAL,
        systemClass: SystemClass.GEMINI_PRO,
        isOnline: true,
        ...overrides
    };
}

/**
 * Create a FuelSystem at a specific fuel level with correct readiness
 */
export function createFuelSystemAtLevel(
    fuelLevel: number,
    thresholds: AlertThresholds = DEFAULT_THRESHOLDS
): FuelSystem {
    const percentage = fuelLevel * 100;
    let readiness: ReadinessLevel;

    if (percentage <= thresholds.critical) {
        readiness = ReadinessLevel.CRITICAL;
    } else if (percentage <= thresholds.warning) {
        readiness = ReadinessLevel.WARNING;
    } else if (percentage <= thresholds.caution) {
        readiness = ReadinessLevel.CAUTION;
    } else {
        readiness = ReadinessLevel.NOMINAL;
    }

    return createFuelSystem({
        fuelLevel,
        readiness,
        systemId: `system-${Math.round(fuelLevel * 100)}pct`
    });
}

/**
 * Create multiple FuelSystems with various states
 */
export function createFuelSystemsWithVariety(): FuelSystem[] {
    return [
        createFuelSystem({
            systemId: 'gemini-pro',
            designation: 'Gemini 3 Pro',
            fuelLevel: 0.85,
            readiness: ReadinessLevel.NOMINAL,
            systemClass: SystemClass.GEMINI_PRO
        }),
        createFuelSystem({
            systemId: 'gemini-flash',
            designation: 'Gemini 3 Flash',
            fuelLevel: 0.45,
            readiness: ReadinessLevel.CAUTION,
            systemClass: SystemClass.GEMINI_FLASH
        }),
        createFuelSystem({
            systemId: 'claude-sonnet',
            designation: 'Claude Sonnet 4',
            fuelLevel: 0.15,
            readiness: ReadinessLevel.WARNING,
            systemClass: SystemClass.CLAUDE
        }),
        createFuelSystem({
            systemId: 'gpt-oss',
            designation: 'GPT OSS 120B',
            fuelLevel: 0.03,
            readiness: ReadinessLevel.CRITICAL,
            systemClass: SystemClass.GPT
        })
    ];
}

/**
 * Create a TelemetrySnapshot with optional overrides
 */
export function createTelemetrySnapshot(overrides: Partial<TelemetrySnapshot> = {}): TelemetrySnapshot {
    const systems = overrides.systems ?? [createFuelSystem()];
    const activeAlerts = systems.filter(s =>
        s.readiness === ReadinessLevel.WARNING ||
        s.readiness === ReadinessLevel.CRITICAL
    ).length;

    return {
        timestamp: Date.now(),
        systems,
        overallReadiness: ReadinessLevel.NOMINAL,
        activeAlerts,
        ...overrides
    };
}

/**
 * Create a TelemetryAlert with optional overrides
 */
export function createTelemetryAlert(overrides: Partial<TelemetryAlert> = {}): TelemetryAlert {
    return {
        id: 'alert-test-1',
        systemId: 'test-system',
        systemDesignation: 'Test System',
        level: ReadinessLevel.WARNING,
        message: 'Low fuel: 15%',
        timestamp: Date.now(),
        acknowledged: false,
        ...overrides
    };
}

/**
 * Create a critical TelemetryAlert
 */
export function createCriticalAlert(overrides: Partial<TelemetryAlert> = {}): TelemetryAlert {
    return createTelemetryAlert({
        level: ReadinessLevel.CRITICAL,
        message: 'Critical: 3% fuel',
        ...overrides
    });
}

/**
 * Create an UplinkStatus with optional overrides
 */
export function createUplinkStatus(overrides: Partial<UplinkStatus> = {}): UplinkStatus {
    return {
        isConnected: true,
        port: 4567,
        securityToken: 'test-token-abc123',
        lastContact: Date.now(),
        signalStrength: 100,
        ...overrides
    };
}

/**
 * Create a disconnected UplinkStatus
 */
export function createDisconnectedUplink(): UplinkStatus {
    return {
        isConnected: false,
        signalStrength: 0
    };
}

/**
 * Create TrendDataPoints over time
 */
export function createTrendDataPoints(
    systemId: string,
    points: { hoursAgo: number; fuelLevel: number }[]
): TrendDataPoint[] {
    const now = Date.now();

    return points.map(p => ({
        timestamp: now - (p.hoursAgo * 60 * 60 * 1000),
        systemId,
        fuelLevel: p.fuelLevel
    })).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Create a declining trend (fuel being consumed)
 */
export function createDecliningTrend(systemId: string = 'test-system'): TrendDataPoint[] {
    return createTrendDataPoints(systemId, [
        { hoursAgo: 2, fuelLevel: 0.80 },
        { hoursAgo: 1.5, fuelLevel: 0.70 },
        { hoursAgo: 1, fuelLevel: 0.60 },
        { hoursAgo: 0.5, fuelLevel: 0.50 },
        { hoursAgo: 0, fuelLevel: 0.40 }
    ]);
}

/**
 * Create a rising trend (fuel being replenished)
 */
export function createRisingTrend(systemId: string = 'test-system'): TrendDataPoint[] {
    return createTrendDataPoints(systemId, [
        { hoursAgo: 1, fuelLevel: 0.20 },
        { hoursAgo: 0.5, fuelLevel: 0.50 },
        { hoursAgo: 0, fuelLevel: 0.90 }
    ]);
}

/**
 * Create a stable trend (minimal change)
 */
export function createStableTrend(systemId: string = 'test-system'): TrendDataPoint[] {
    return createTrendDataPoints(systemId, [
        { hoursAgo: 1, fuelLevel: 0.50 },
        { hoursAgo: 0.5, fuelLevel: 0.49 },
        { hoursAgo: 0, fuelLevel: 0.48 }
    ]);
}

/**
 * Create a ModelConfig for API response testing
 */
export function createModelConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
    return {
        label: 'test-model',
        modelOrAlias: { model: 'test-model-id' },
        quotaInfo: {
            remainingFraction: 0.75,
            resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        ...overrides
    };
}

/**
 * Create a ServerTelemetryResponse with optional model configs
 */
export function createServerTelemetryResponse(
    configs: ModelConfig[] = [createModelConfig()]
): ServerTelemetryResponse {
    return {
        userStatus: {
            cascadeModelConfigData: {
                clientModelConfigs: configs
            }
        }
    };
}

/**
 * Create an empty ServerTelemetryResponse
 */
export function createEmptyServerResponse(): ServerTelemetryResponse {
    return {
        userStatus: {
            cascadeModelConfigData: {
                clientModelConfigs: []
            }
        }
    };
}

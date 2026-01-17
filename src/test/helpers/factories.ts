/**
 * AG Telemetry - Test Data Factories
 * Factory functions for creating test data with sensible defaults
 */

import {
    FuelSystem,
    ReadinessLevel,
    SystemClass,
    TelemetrySnapshot,
    UplinkStatus,
    AlertThresholds,
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

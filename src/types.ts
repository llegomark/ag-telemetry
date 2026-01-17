/**
 * AG Telemetry - Type Definitions
 * Simplified types for AI model quota monitoring
 */

/** System readiness levels based on quota */
export enum ReadinessLevel {
    NOMINAL = 'nominal',
    CAUTION = 'caution',
    WARNING = 'warning',
    CRITICAL = 'critical',
    OFFLINE = 'offline'
}

/** Fuel system representing an AI model */
export interface FuelSystem {
    /** Unique identifier for the model */
    systemId: string;
    /** Human-readable system name */
    designation: string;
    /** Fuel level as decimal (0.0 - 1.0) */
    fuelLevel: number;
    /** ISO timestamp for next quota reset */
    replenishmentEta?: string;
    /** Current readiness assessment */
    readiness: ReadinessLevel;
    /** System category classification */
    systemClass: SystemClass;
    /** Whether system is currently active */
    isOnline: boolean;
    /** Quota pool identifier (shared among models with same quota) */
    quotaPoolId?: string;
}

/** Classification of AI model systems */
export enum SystemClass {
    GEMINI_PRO = 'gemini-pro',
    GEMINI_FLASH = 'gemini-flash',
    CLAUDE = 'claude',
    GPT = 'gpt',
    EXPERIMENTAL = 'experimental'
}

/** Telemetry snapshot for a point in time */
export interface TelemetrySnapshot {
    timestamp: number;
    systems: FuelSystem[];
    overallReadiness: ReadinessLevel;
    activeAlerts: number;
}

/** Default alert thresholds (used internally) */
export interface AlertThresholds {
    caution: number;
    warning: number;
    critical: number;
}

/** Uplink connection state */
export interface UplinkStatus {
    isConnected: boolean;
    port?: number;
    securityToken?: string;
    lastContact?: number;
    signalStrength: number;
}

/** Configuration for the extension (simplified) */
export interface TelemetryConfig {
    scanInterval: number;
}

/** API response from the language server */
export interface ServerTelemetryResponse {
    userStatus?: {
        cascadeModelConfigData?: {
            clientModelConfigs?: ModelConfig[];
        };
    };
}

/** Model configuration from API */
export interface ModelConfig {
    label: string;
    modelOrAlias?: {
        model?: string;
    };
    quotaInfo?: {
        /** Remaining quota fraction (0.0-1.0). May be missing when quota is exhausted. */
        remainingFraction?: number;
        /** ISO timestamp for next quota reset */
        resetTime?: string;
    };
}

/** Event types for the telemetry bus */
export type TelemetryEventType =
    | 'uplink-established'
    | 'uplink-lost'
    | 'telemetry-received'
    | 'scan-started'
    | 'scan-completed'
    | 'error';

/** Event payload structure */
export interface TelemetryEvent {
    type: TelemetryEventType;
    timestamp: number;
    payload?: unknown;
}

/** Tree item types for the views */
export enum TreeItemType {
    SYSTEM_HEADER = 'system-header',
    FUEL_SYSTEM = 'fuel-system',
    FUEL_GAUGE = 'fuel-gauge',
    REPLENISH_TIMER = 'replenish-timer',
    INFO_ITEM = 'info-item',
    UPLINK_STATUS = 'uplink-status',
    QUOTA_POOL = 'quota-pool'
}

/**
 * AG Telemetry - Type Definitions
 * Space mission-themed types for AI model monitoring
 */

/** System readiness levels based on fuel reserves */
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
    /** ISO timestamp for next fuel replenishment */
    replenishmentEta?: string;
    /** Current readiness assessment */
    readiness: ReadinessLevel;
    /** System category classification */
    systemClass: SystemClass;
    /** Whether system is currently active */
    isOnline: boolean;
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

/** Historical data point for trend analysis */
export interface TrendDataPoint {
    timestamp: number;
    systemId: string;
    fuelLevel: number;
}

/** Alert configuration thresholds */
export interface AlertThresholds {
    caution: number;
    warning: number;
    critical: number;
}

/** Active alert instance */
export interface TelemetryAlert {
    id: string;
    systemId: string;
    systemDesignation: string;
    level: ReadinessLevel;
    message: string;
    timestamp: number;
    acknowledged: boolean;
}

/** Uplink connection state */
export interface UplinkStatus {
    isConnected: boolean;
    port?: number;
    securityToken?: string;
    lastContact?: number;
    signalStrength: number;
}

/** Configuration for the extension */
export interface TelemetryConfig {
    scanInterval: number;
    alertThresholds: AlertThresholds;
    enableNotifications: boolean;
    flightDeckMode: 'compact' | 'detailed' | 'minimal';
    trackHistory: boolean;
    prioritySystems: string[];
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
        remainingFraction: number;
        resetTime?: string;
    };
}

/** Event types for the telemetry bus */
export type TelemetryEventType =
    | 'uplink-established'
    | 'uplink-lost'
    | 'telemetry-received'
    | 'alert-triggered'
    | 'alert-cleared'
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
    ALERT_ITEM = 'alert-item',
    INFO_ITEM = 'info-item',
    UPLINK_STATUS = 'uplink-status'
}

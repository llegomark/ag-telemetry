/**
 * AG Telemetry - Security Utilities
 * Provides sanitization and validation functions for untrusted data
 */

/**
 * Escapes markdown special characters to prevent injection attacks.
 * Use this function on any server-derived or untrusted content before
 * inserting it into MarkdownString instances.
 *
 * @param text - The untrusted text to escape
 * @returns The escaped text safe for markdown rendering
 */
export function escapeMarkdown(text: string): string {
    if (!text) {
        return '';
    }
    // Escape markdown special characters: * _ ` [ ] ( ) # ! \
    // Also escape | for table safety and > for blockquote safety
    // Note: Inside character class, [ doesn't need escaping but ] does
    return text.replace(/[*_`[\]()#!\\|>]/g, '\\$&');
}

/**
 * Validates that a value is a valid process ID.
 * PIDs must be positive integers within the system's valid range.
 *
 * Linux max PID is typically 4194304 (2^22) but can be configured.
 * Windows max PID is typically around 4194304 as well.
 * macOS follows similar limits.
 *
 * @param pid - The process ID to validate
 * @returns true if the PID is valid, false otherwise
 */
export function isValidPid(pid: number): boolean {
    return Number.isInteger(pid) && pid > 0 && pid <= 4194304;
}

/**
 * Type guard for validating TrendDataPoint structure.
 * Used when loading data from storage to prevent type confusion attacks.
 */
export function isValidTrendDataPoint(point: unknown): point is {
    timestamp: number;
    systemId: string;
    fuelLevel: number;
} {
    if (!point || typeof point !== 'object') {
        return false;
    }

    const p = point as Record<string, unknown>;

    return (
        typeof p.timestamp === 'number' &&
        Number.isFinite(p.timestamp) &&
        p.timestamp > 0 &&
        typeof p.systemId === 'string' &&
        p.systemId.length > 0 &&
        p.systemId.length <= 256 && // Reasonable limit for system IDs
        typeof p.fuelLevel === 'number' &&
        Number.isFinite(p.fuelLevel) &&
        p.fuelLevel >= 0 &&
        p.fuelLevel <= 1
    );
}

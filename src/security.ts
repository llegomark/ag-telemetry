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
 * Validates that alert thresholds are properly ordered.
 * Thresholds must satisfy: caution > warning > critical > 0
 * All values must be between 1 and 100 (percentages).
 *
 * @param thresholds - The threshold configuration to validate
 * @returns true if thresholds are valid and properly ordered
 */
export function isValidAlertThresholds(thresholds: {
    caution: number;
    warning: number;
    critical: number;
} | null | undefined): boolean {
    // Handle null/undefined input gracefully
    if (!thresholds || typeof thresholds !== 'object') {
        return false;
    }

    const { caution, warning, critical } = thresholds;

    // All must be numbers
    if (
        typeof caution !== 'number' ||
        typeof warning !== 'number' ||
        typeof critical !== 'number'
    ) {
        return false;
    }

    // All must be finite values in valid percentage range
    if (
        !Number.isFinite(caution) || caution < 1 || caution > 100 ||
        !Number.isFinite(warning) || warning < 1 || warning > 100 ||
        !Number.isFinite(critical) || critical < 1 || critical > 100
    ) {
        return false;
    }

    // Must be properly ordered: caution > warning > critical
    return caution > warning && warning > critical;
}

/**
 * Sanitizes notification content by truncating overly long strings
 * and removing potentially misleading characters.
 *
 * @param text - The text to sanitize for notification display
 * @param maxLength - Maximum allowed length (default: 100, minimum: 4)
 * @returns Sanitized text safe for notification display
 */
export function sanitizeNotificationContent(text: string, maxLength: number = 100): string {
    if (!text) {
        return '';
    }

    // Ensure maxLength is at least 4 to accommodate "..." plus one character
    const effectiveMaxLength = Math.max(4, maxLength);

    // Remove control characters and zero-width characters that could be used for spoofing
    // eslint-disable-next-line no-control-regex -- Intentionally matching control chars to remove them
    let sanitized = text.replace(/[\x00-\x1F\x7F\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');

    // Remove excessive whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    // Truncate if too long
    if (sanitized.length > effectiveMaxLength) {
        sanitized = sanitized.substring(0, effectiveMaxLength - 3) + '...';
    }

    return sanitized;
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

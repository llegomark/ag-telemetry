# Changelog

All notable changes to AG Telemetry will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.4] - 2025-12-27

### Security

- **Alert threshold validation**: Added `isValidAlertThresholds()` to validate threshold ordering (caution > warning > critical) and prevent misconfiguration that could cause alerts to fire incorrectly
- **Notification content sanitization**: Added `sanitizeNotificationContent()` to protect against UI abuse from malicious server responses:
  - Removes control characters (null bytes, bell, etc.)
  - Strips zero-width and direction override characters used for text spoofing
  - Truncates overly long strings to prevent notification overflow
  - Normalizes excessive whitespace
- **Workspace trust check**: Extension now warns users when running in untrusted workspaces where configuration may come from untrusted sources

### Added

- New security utilities in `security.ts`:
  - `isValidAlertThresholds()`: Validates threshold configuration ordering and bounds
  - `sanitizeNotificationContent()`: Sanitizes text for safe notification display
- Interactive threshold validation in "Configure Alerts" dialog with real-time ordering feedback
- Comprehensive unit tests for new security functions (21 new test cases)

### Fixed

- `isValidAlertThresholds()` now handles null/undefined input gracefully instead of throwing
- `sanitizeNotificationContent()` now handles edge cases where maxLength < 4 by enforcing a minimum effective length

### Changed

- Alert threshold configuration now falls back to safe defaults if user-configured values are invalid
- Notification messages now sanitize model designations before display

## [1.0.3] - 2025-12-27

### Security

- **Markdown injection prevention**: Added `escapeMarkdown()` utility to sanitize server-derived content before rendering in MarkdownString tooltips, preventing potential XSS-style attacks from malicious language server responses
- **Removed `isTrusted` flag**: Disabled command link execution in status bar tooltips to prevent malicious content from triggering VS Code commands
- **Storage validation**: Added schema validation for history data loaded from extension storage to prevent type confusion attacks from corrupted or malicious data
- **PID bounds validation**: Added defense-in-depth validation for process IDs before shell command execution

### Added

- New `security.ts` module with reusable security utilities:
  - `escapeMarkdown()`: Escapes markdown special characters in untrusted content
  - `isValidPid()`: Validates process IDs within system limits (1-4194304)
  - `isValidTrendDataPoint()`: Type guard for validating stored trend data structure

### Changed

- Documented security rationale for `rejectUnauthorized: false` in HTTPS requests (required for localhost self-signed certificates)

## [1.0.2] - 2025-12-27

### Fixed

- **miniGauge display bug**: Fixed copy-paste error where the status bar gauge returned the same character (`▱`) for both medium and low fuel levels. Now uses distinct characters: `▰` (high), `▱` (medium), `▫` (low/critical)
- **Missing error notification**: Added user-friendly notification when Antigravity process isn't found, with actionable "Retry Connection" and "Open Settings" buttons
- **Manual reconnection feedback**: The "Establish Uplink" command now shows clear success/failure messages

### Changed

- Removed redundant `stopPeriodicScans()` call in configuration change handler (already called internally by `startPeriodicScans()`)

## [1.0.0] - 2025-12-27

### Added

- Initial release
- **Sidebar Mission Control Panel** with three views:
  - System Status: Overall fleet readiness and uplink status
  - Fuel Reserves: Individual model fuel levels with details
  - Active Alerts: Real-time low fuel warnings
- **Flight Deck Status Bar** with three display modes:
  - Minimal: Overall status indicator
  - Compact: Status + most critical system (default)
  - Detailed: Multiple system gauges
- **Mission Briefing** quick pick dashboard
- **Usage Trend Tracking** with:
  - Sparkline visualizations
  - Consumption rate calculations
  - Time-to-empty estimations
  - 7-day history retention
- **Configurable Alert System**:
  - Three-tier thresholds (Caution/Warning/Critical)
  - VS Code notification integration
  - 5-minute cooldown per system
- **Cross-platform Support**: Windows, macOS, Linux
- **Auto-reconnection** on uplink loss
- **Configuration options** for all features

### Supported Models

- Gemini 3 Pro (High/Low)
- Gemini 3 Flash
- Claude Sonnet 4.5 / Claude Sonnet 4.5 (Thinking)
- Claude Opus 4.5 (Thinking)
- GPT OSS 120B (Medium)
- All other Antigravity AI models

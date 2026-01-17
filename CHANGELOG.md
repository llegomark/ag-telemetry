# Changelog

All notable changes to AG Telemetry will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.2] - 2026-01-17

### Fixed

- **Critical: Exhausted models no longer hidden**: Models with fully consumed quota now remain visible in the UI instead of disappearing entirely
  - Root cause: `processTelemetryData` was skipping models without `quotaInfo` or with missing `remainingFraction`
  - Models without quota info are now treated as exhausted (0% fuel level) and displayed with prominent styling
  - Tree view shows warning icon and "EXHAUSTED • Resets: Xh Ym" for exhausted models  
  - Status bar shows warning styling when Claude Opus quota is exhausted
  - Tooltips prominently display reset time countdown for exhausted models

- **Status bar now shows accurate average quota**: Previously showed only the most critical model (e.g., "CS:0%"), now shows average across all models
  - Mixed states show available count: "AGT 43% (3/7)" means 43% average with 3 of 7 models available
  - Tooltip now includes summary: "Models: 3 available, 4 exhausted"

### Changed

- `ModelConfig.quotaInfo.remainingFraction` is now optional to support API responses where quota is exhausted

## [2.0.1] - 2026-01-17

### Changed

- **Claude Opus tooltip**: Hovering over the Claude Opus 4.5 (Thinking) status bar item now shows the remaining time until quota reset instead of the remaining usage percentage
  - Displays in human-readable format: "Resets in Xd Yh", "Resets in Xh Ym", or "Resets in Xm"
  - Shows "Resetting soon..." when reset is imminent
  - Shows "Reset time unknown" if reset time is unavailable

## [2.0.0] - 2026-01-17

### ⚠️ BREAKING CHANGES

This is a major simplification release. Several features have been removed to focus purely on quota display.

### Removed

- **Alert Manager**: Removed all pop-up notifications for low fuel levels
  - Deleted `alert_manager.ts` (209 lines)
  - Deleted `AlertsViewProvider` and "Active Alerts" sidebar view
  - Deleted `agTelemetry.configureAlerts` command
  
- **History Tracker**: Removed usage trend tracking
  - Deleted `history_tracker.ts` (487 lines)
  - Deleted `agTelemetry.viewTrends` command
  - No more local storage writes for trend data
  - No more sparkline visualizations, consumption rates, or time-to-empty estimates
  
- **Detailed Status Bar Mode**: Removed multi-model status bar display
  - Only compact mode remains (shows overall or lowest model percentage)
  
- **Configurable Alert Thresholds**: Now hardcoded (5% critical, 20% warning, 40% caution)
  - Removed `agTelemetry.alertThresholds` setting
  
- **Enable Notifications Setting**: No notifications = no toggle needed
  - Removed `agTelemetry.enableNotifications` setting
  
- **Flight Deck Mode Setting**: Only compact mode remains
  - Removed `agTelemetry.flightDeckMode` setting
  
- **Track History Setting**: No history = no toggle needed
  - Removed `agTelemetry.trackHistory` setting
  
- **Priority Systems Setting**: Removed user-defined model prioritization
  - Removed `agTelemetry.prioritySystems` setting

### Changed

- **Sidebar Views**: Reduced from 3 views to 2
  - "System Status" - Uplink status and connection info
  - "Model Quota" (renamed from "Fuel Reserves") - List of models with quotas
  
- **Mission Briefing**: Simplified quick pick dialog
  - Shows models grouped by quota pool
  - Single "Refresh Telemetry" action
  
- **Configuration**: Simplified to single setting
  - Only `agTelemetry.scanInterval` remains (30-86400 seconds)

### Kept

- Compact status bar display with lowest model percentage
- Dedicated Claude Opus 4.5 (Thinking) status bar item
- Click status bar → view all models quick pick
- System Status and Model Quota sidebar views
- Quota pool detection and grouping
- Refresh and Diagnostics commands
- All security utilities and input validation

### Technical

- Total lines removed: ~1,100 (~40% of codebase)
- All 182 unit tests still passing
- Zero lint warnings

## [1.0.11] - 2026-01-14

### Changed

- **Silent Mode**: Extension now operates silently without interrupting user workflow
  - Removed automatic sidebar focus on startup - view container icon remains accessible without forcing focus
  - Converted all informational popup notifications to brief status bar messages
  - Untrusted workspace warning now displays as status bar message (5s) instead of modal popup
  - Connection status messages (success/waiting) now use status bar (3s-5s)
  - Settings change confirmations now use status bar (3s)
  - Diagnostics completion now shows status bar message with optional quick pick for actions

### Unchanged

- **Important alerts preserved**: Low fuel warnings and consecutive API failure notifications remain as popup notifications since they require user attention

## [1.0.10] - 2025-12-29

### Changed

- **Rebranding**: Extension renamed from "AG Telemetry" to "Antigravity AI Quota & Usage Tracker" for better discoverability on Open VSX Registry
- **Description**: Updated extension description to "Track and monitor your Antigravity AI model quota usage, remaining limits, and usage trends in real-time"
- **README updates**: All references to "AG Telemetry" updated to use new extension name

## [1.0.9] - 2025-12-28

### Fixed

- **False positive pool detection**: Models at exactly 100% fuel are now excluded from quota pool grouping to prevent incorrectly grouping models with separate quotas (e.g., Gemini Pro High, Gemini Pro Low, Gemini Flash all at 100% would no longer be grouped as a shared pool)

### Security

- **Concurrency protection in TelemetryService**: Added `isEstablishingUplink` lock to `establishUplink()` to prevent race conditions from rapid button clicks or multiple command triggers
  - Multiple concurrent process discovery scans could cause overlapping shell commands
  - Lock prevents new scans from starting if one is already in progress
  - Uses `try/finally` pattern to ensure lock is always released

### Added

- **Unit tests**: Added 2 additional test cases for 100% fuel exclusion
  - `should skip models at 100% fuel to avoid false positives`
  - `should group models just below 100% but not at 100%`

### Technical Details

- Pool detection now skips models where `fuelLevel >= 1.0`
- Once any usage occurs (fuel drops below 100%), shared pools are correctly detected
- 0% fuel models are still grouped (depleted together indicates shared quota)
- `establishUplink()` now returns `false` immediately if called while already in progress

## [1.0.8] - 2025-12-28

### Added

- **Quota Pool Grouping**: Visual grouping for AI models that share the same usage quota
  - Models with identical fuel levels are automatically detected as sharing a quota pool
  - Sidebar displays pooled models under collapsible "Shared Pool" headers with link icon (🔗)
  - Enhanced tooltips show "Shares quota with: Model A, Model B" for pooled models
  - Mission Briefing groups pooled models together with pool-level fuel indicators
  - Status bar tooltip includes "Pool" column with 🔗 indicator and legend
- **New type definitions**:
  - Added `quotaPoolId` field to `FuelSystem` interface for tracking pool membership
  - Added `QUOTA_POOL` to `TreeItemType` enum for pool header tree items
- **Unit tests**: Added 11 new test cases for quota pool detection algorithm
  - Tests for pool assignment, unique fuel levels, multiple pools
  - Edge cases: empty array, single system, all same level
  - Floating point precision handling at 6 decimal places
  - Boundary values (0% and 100% fuel levels)

### Changed

- `FuelViewProvider` now groups models by quota pool before displaying individual systems
- Pool headers are sorted by fuel level (lowest first) for quick identification of depleted pools
- Standalone (non-pooled) models appear after pool groups, sorted by priority then fuel level

### Technical Details

- Pool detection uses `.toFixed(6)` precision to reliably group models with matching fuel levels
- Pool IDs are generated internally (`pool-1`, `pool-2`, etc.) and are stable within a telemetry snapshot
- Only groups of 2+ models receive pool IDs; unique fuel levels remain unpooled

## [1.0.7] - 2025-12-27

### Added

- **Open VSX Registry**: Extension now available on [Open VSX Registry](https://open-vsx.org/extension/llegomark/ag-telemetry) for easy installation in Antigravity IDE

### Changed

- Updated README with new installation instructions for Antigravity IDE via Extensions view

## [1.0.5] - 2025-12-27

### Added

- **Run Diagnostics command** (`agTelemetry.runDiagnostics`): Comprehensive diagnostic tool for troubleshooting connection and API issues
  - Displays uplink status (port, signal strength, CSRF token presence)
  - Shows consecutive failure count and schema validation results
  - Lists detected systems with fuel levels
  - Includes raw API response sample for debugging
  - Shows expected API structure for comparison
  - Provides actionable buttons: "Retry Connection", "Report Issue"
- **Schema validation**: New `validateServerResponse()` function validates API response structure before processing
  - Checks for required fields: `userStatus`, `cascadeModelConfigData`, `clientModelConfigs`
  - Logs detailed error messages with received keys for debugging API changes
  - Adds warnings for empty configs or unexpected structure
- **Consecutive failure tracking**: Monitors failed API requests and alerts users after 3 consecutive failures
  - Helps detect when Antigravity IDE updates break API compatibility
  - Shows error notification with "Run Diagnostics", "Report Issue", and "Retry" options
- **Diagnostic information storage**: Stores last raw response, validation results, and failure count for debugging
  - `getLastRawResponse()`: Access raw API response
  - `getLastValidation()`: Access validation results
  - `getConsecutiveFailures()`: Access failure count
  - `getDiagnosticInfo()`: Get comprehensive diagnostic data
  - `resetFailureCounter()`: Reset failure count for manual retry

### Fixed

- **Null array element crash**: Fixed potential TypeError when API returns null elements in `clientModelConfigs` array
  - Added guard against null/undefined array elements in schema validation

### Changed

- `acquireTelemetry()` now validates response schema before processing and tracks consecutive failures
- Error events now include structured payload with error type for better handling

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

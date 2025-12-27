# Changelog

All notable changes to AG Telemetry will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

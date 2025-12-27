# AG Telemetry

**Mission control dashboard for monitoring Antigravity AI model fuel levels and system telemetry.**

<img width="1920" height="1080" alt="Screenshot From 2025-12-27 10-13-07" src="https://github.com/user-attachments/assets/0277052c-a357-40aa-b071-17ca98ba5909" />
<img width="1920" height="1080" alt="Screenshot From 2025-12-27 10-13-00" src="https://github.com/user-attachments/assets/fa94df9b-7e6b-437e-950e-18f1fd551223" />

AG Telemetry provides real-time monitoring of your AI model quota usage in Antigravity IDE with a space mission-themed interface, including sidebar views, status bar indicators, usage trend tracking, and configurable alerts.

## Features

### Mission Briefing Dashboard

Quick access to all your AI model fuel levels through an intuitive quick pick interface:

- View all models at a glance with visual fuel gauges
- See current usage percentages for each model
- Quick actions for refresh, trends, and alert configuration

### Sidebar Mission Control Panel

A dedicated activity bar panel with three specialized views:

| View | Description |
|------|-------------|
| **System Status** | Overall fleet readiness, uplink connection status, and system counts |
| **Fuel Reserves** | Individual model fuel levels with expandable details and replenishment timers |
| **Active Alerts** | Real-time alerts for systems with low fuel levels |

### Flight Deck Status Bar

A unique status bar display showing your AI model status with three display modes:

| Mode | Description | Example |
|------|-------------|---------|
| **Minimal** | Overall fleet status indicator only | `$(pulse) AGT ●` |
| **Compact** | Status + most critical system (default) | `$(pulse) AGT CS:45%` |
| **Detailed** | Multiple system gauges | `$(pulse) AGT` + `GP▰80 CS▱45 GF▰90` |

### Status Bar Tooltip

Hover over the status bar item to see a comprehensive mission status overview with fuel gauges for all your AI models.

### Usage Trend Tracking

- Automatic sampling of fuel levels over time (stored locally)
- Sparkline visualizations of usage patterns
- Consumption rate calculations (% per hour)
- Time-to-empty estimations
- 7-day history retention

### Configurable Alert System

Three-tier threshold system with VS Code notifications:

| Level | Default | Description |
|-------|---------|-------------|
| **Caution** | 40% | Early warning indicator |
| **Warning** | 20% | Action recommended |
| **Critical** | 5% | Immediate attention required |

## Supported Models

AG Telemetry automatically detects and monitors all AI models available in your Antigravity installation:

- Gemini 3 Pro (High/Low)
- Gemini 3 Flash
- Claude Sonnet 4.5 / Claude Sonnet 4.5 (Thinking)
- Claude Opus 4.5 (Thinking)
- GPT OSS 120B (Medium)
- And any other models configured in Antigravity

## Requirements

- **[Antigravity IDE](https://antigravity.google/download)** (the next-generation IDE)
- Antigravity must be running with an active session

## Installation

### From VSIX File

1. Download the latest `.vsix` file from [Releases](https://github.com/llegomark/ag-telemetry/releases)
2. Open Antigravity
3. Press `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
4. Select the downloaded `.vsix` file
5. Reload when prompted

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

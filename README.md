# Antigravity AI Quota & Usage Tracker

**Track and monitor your Antigravity AI model quota usage and remaining limits in real-time.**

A streamlined VS Code extension for Antigravity IDE that displays your AI model quota levels with a space mission-themed interface, including sidebar views, status bar indicators, and quota pool detection.

## Features

### Status Bar Display

A compact status bar indicator showing your AI model quota status:

- Shows overall quota percentage or the most critical model
- **Dedicated Claude Opus (Thinking) display** - Shows the latest available version (4.6 on Ultra, 4.5 on Pro)
- Click to open the quota quick pick for detailed view
- Color-coded backgrounds for warning (orange) and critical (red) states

### Quota Quick Pick

Quick access to all your AI model quota levels:

- View all models at a glance with visual gauges
- See current usage percentages for each model
- **Quota pool grouping** - Models sharing the same quota are visually grouped
- Refresh telemetry action

### Sidebar Mission Control Panel

A dedicated activity bar panel with two views:

| View | Description |
|------|-------------|
| **System Status** | Uplink connection status, overall readiness, and system counts |
| **Model Quota** | Individual model quota levels with expandable details and reset timers |

### Quota Pool Detection

Automatically detects and groups models that share the same usage quota:

- Models with identical fuel levels are grouped under "Shared Pool" headers
- Tooltips show which models share quota with each other
- Visual 🔗 indicator marks pooled models

## Supported Models

The extension automatically detects and monitors all AI models available in your Antigravity installation:

- Gemini 3 Pro (High/Low)
- Gemini 3 Flash
- Claude Sonnet 4.5 / Claude Sonnet 4.5 (Thinking)
- Claude Opus 4.5 (Thinking) / Claude Opus 4.6 (Thinking)
- GPT OSS 120B (Medium)
- And any other models configured in Antigravity

## Commands

| Command | Description |
|---------|-------------|
| `AG Telemetry: Refresh Telemetry` | Manually refresh quota data |
| `AG Telemetry: View Quota Status` | Open the quota quick pick dialog |
| `AG Telemetry: Establish Uplink` | Reconnect to Antigravity language server |
| `AG Telemetry: Run Diagnostics` | Display diagnostic information for troubleshooting |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agTelemetry.scanInterval` | 90 | Telemetry scan interval in seconds (30-86400) |

## Requirements

- **[Antigravity IDE](https://antigravity.google/download)** (the next-generation IDE)
- Antigravity must be running with an active session

## Installation

### From Antigravity IDE (Recommended)

1. Open Antigravity IDE
2. Go to the Extensions view (`Ctrl+Shift+X`)
3. Search for **"Antigravity AI Quota & Usage Tracker"**
4. Click **Install**

The extension is available on the [Open VSX Registry](https://open-vsx.org/extension/llegomark/ag-telemetry).

### From VSIX File

1. Download the latest `.vsix` file from [Releases](https://github.com/llegomark/ag-telemetry/releases)
2. Open Antigravity IDE
3. Press `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
4. Select the downloaded `.vsix` file
5. Reload when prompted

## What's New in v2.0.4

- **Claude Opus 4.6 (Thinking) support**: Now detects and displays the new Claude Opus 4.6 model for Ultra plan subscribers
- **Dynamic version display**: Status bar shows the actual detected model version (4.6, 4.5, or 4)
- **Automatic prioritization**: Newer model versions are automatically preferred when available

Version 2.0.0 was a major simplification release that removed alert notifications, usage trend tracking, and detailed status bar mode in favor of a streamlined quota display experience.

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

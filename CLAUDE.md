# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run compile      # One-time TypeScript compilation
npm run watch        # Continuous compilation (for development)
npm run lint         # Run ESLint on src/
npm run package      # Create VSIX package (uses vsce)
```

**Development workflow:** Run `npm run watch`, then press F5 in VS Code to launch the Extension Development Host.

## Architecture Overview

AG Telemetry is a VS Code extension that monitors AI model quota usage in Antigravity IDE. It uses a space mission theme throughout the codebase ("fuel levels", "uplink", "flight deck").

### Core Data Flow

```
Antigravity Language Server (localhost:PORT)
           ↓ HTTPS + CSRF token
    TelemetryService (process discovery, API calls)
           ↓ emits TelemetryEvent
    ┌──────┴──────┬────────────┐
AlertManager   HistoryTracker   Views refresh
(notifications) (trend data)    (tree + status bar)
```

### Key Components

| File | Purpose |
|------|---------|
| `extension.ts` | Entry point, wires all services, registers commands, handles config changes |
| `telemetry_service.ts` | Core service: discovers Antigravity process, establishes uplink, fetches quota data via HTTPS |
| `tree_providers.ts` | Three TreeDataProviders: SystemsView (fleet status), FuelView (per-model levels), AlertsView |
| `flight_deck.ts` | Status bar display with 3 modes (minimal/compact/detailed) |
| `alert_manager.ts` | Triggers VS Code notifications with 5-min cooldown per system |
| `history_tracker.ts` | Samples fuel levels, calculates trends, stores 7 days in globalState |
| `types.ts` | All TypeScript interfaces (FuelSystem, TelemetrySnapshot, ReadinessLevel, etc.) |

### Event-Driven Architecture

TelemetryService uses a pub-sub pattern. Subscribe with `telemetryService.subscribe(callback)` which returns an unsubscribe function. Event types: `uplink-established`, `uplink-lost`, `telemetry-received`, `alert-triggered`, `scan-started`, `scan-completed`, `error`.

### Cross-Platform Process Discovery

`telemetry_service.ts` uses platform-specific commands to find the Antigravity language server:
- **Windows**: PowerShell `Get-CimInstance`
- **macOS**: `lsof` for port scanning
- **Linux**: `ss` for listening ports

The CSRF token is extracted from the process command line via regex.

### Configuration Reactivity

All settings under `agTelemetry.*` are reactive. Changes trigger full service reconfiguration without restart. Key settings: `scanInterval` (polling rate), `alertThresholds` (caution/warning/critical percentages), `flightDeckMode`, `prioritySystems`.

## Extension Manifest

Activation: `onStartupFinished`. Entry point: `./out/extension.js`.

Five commands registered: `refreshTelemetry`, `missionBriefing`, `viewTrends`, `configureAlerts`, `establishLink`.

Three sidebar views under `agTelemetryContainer`: SystemsView, FuelView, AlertsView.

## TypeScript Configuration

- Target: ES2022
- Module: Node16 (output is CommonJS for VS Code compatibility)
- Strict mode enabled
- Source maps enabled for debugging

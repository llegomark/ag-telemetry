/**
 * AG Telemetry - Alert Manager
 * Handles telemetry alerts and notifications
 */

import * as vscode from 'vscode';
import {
    TelemetryAlert,
    FuelSystem,
    ReadinessLevel
} from './types';

/**
 * Manages telemetry alerts and user notifications
 */
export class AlertManager {
    private activeAlerts: Map<string, TelemetryAlert> = new Map();
    private acknowledgedIds: Set<string> = new Set();
    private notificationsEnabled: boolean;
    private lastNotificationTime: Map<string, number> = new Map();

    // Minimum interval between notifications for same system (5 minutes)
    private readonly NOTIFICATION_COOLDOWN = 300000;

    constructor(enabled: boolean) {
        this.notificationsEnabled = enabled;
    }

    /**
     * Process fuel systems and generate/clear alerts
     */
    processTelemetry(systems: FuelSystem[]): TelemetryAlert[] {
        const currentSystemIds = new Set<string>();

        for (const system of systems) {
            currentSystemIds.add(system.systemId);

            if (this.shouldTriggerAlert(system)) {
                this.triggerAlert(system);
            } else if (this.activeAlerts.has(system.systemId)) {
                this.clearAlert(system.systemId);
            }
        }

        // Clear alerts for systems no longer present
        for (const alertId of this.activeAlerts.keys()) {
            if (!currentSystemIds.has(alertId)) {
                this.clearAlert(alertId);
            }
        }

        return this.getActiveAlerts();
    }

    /**
     * Determine if system should trigger an alert
     */
    private shouldTriggerAlert(system: FuelSystem): boolean {
        return system.readiness === ReadinessLevel.WARNING ||
            system.readiness === ReadinessLevel.CRITICAL;
    }

    /**
     * Trigger alert for a system
     */
    private triggerAlert(system: FuelSystem): void {
        const existingAlert = this.activeAlerts.get(system.systemId);
        const percentage = Math.round(system.fuelLevel * 100);

        // Update existing alert or create new one
        const alert: TelemetryAlert = {
            id: `alert-${system.systemId}`,
            systemId: system.systemId,
            systemDesignation: system.designation,
            level: system.readiness,
            message: this.generateAlertMessage(system.readiness, percentage),
            timestamp: existingAlert?.timestamp ?? Date.now(),
            acknowledged: existingAlert?.acknowledged ?? false
        };

        const isNewAlert = !existingAlert;
        const levelEscalated = existingAlert &&
            existingAlert.level === ReadinessLevel.WARNING &&
            system.readiness === ReadinessLevel.CRITICAL;

        this.activeAlerts.set(system.systemId, alert);

        // Show notification for new alerts or escalations
        if (this.notificationsEnabled && (isNewAlert || levelEscalated)) {
            this.showNotification(alert, system);
        }
    }

    /**
     * Clear alert for a system
     */
    private clearAlert(systemId: string): void {
        const alert = this.activeAlerts.get(systemId);
        if (alert) {
            this.activeAlerts.delete(systemId);
            this.acknowledgedIds.delete(alert.id);
        }
    }

    /**
     * Generate human-readable alert message
     */
    private generateAlertMessage(level: ReadinessLevel, percentage: number): string {
        if (level === ReadinessLevel.CRITICAL) {
            return percentage === 0
                ? 'Fuel depleted'
                : `Critical: ${percentage}% fuel`;
        }
        return `Low fuel: ${percentage}%`;
    }

    /**
     * Show VS Code notification for alert
     */
    private showNotification(alert: TelemetryAlert, system: FuelSystem): void {
        // Check cooldown
        const lastTime = this.lastNotificationTime.get(system.systemId);
        if (lastTime && Date.now() - lastTime < this.NOTIFICATION_COOLDOWN) {
            return;
        }

        this.lastNotificationTime.set(system.systemId, Date.now());
        const percentage = Math.round(system.fuelLevel * 100);

        if (alert.level === ReadinessLevel.CRITICAL) {
            vscode.window.showErrorMessage(
                `[AG Telemetry] ${system.designation}: ${percentage}% fuel remaining`,
                'View Details',
                'Dismiss'
            ).then(action => {
                if (action === 'View Details') {
                    vscode.commands.executeCommand('agTelemetryFuelView.focus');
                }
            });
        } else {
            vscode.window.showWarningMessage(
                `[AG Telemetry] ${system.designation}: ${percentage}% fuel remaining`,
                'View Details'
            ).then(action => {
                if (action === 'View Details') {
                    vscode.commands.executeCommand('agTelemetryFuelView.focus');
                }
            });
        }
    }

    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId: string): void {
        const alert = Array.from(this.activeAlerts.values())
            .find(a => a.id === alertId);

        if (alert) {
            alert.acknowledged = true;
            this.acknowledgedIds.add(alertId);
        }
    }

    /**
     * Get all active alerts
     */
    getActiveAlerts(): TelemetryAlert[] {
        return Array.from(this.activeAlerts.values());
    }

    /**
     * Get unacknowledged alert count
     */
    getUnacknowledgedCount(): number {
        return Array.from(this.activeAlerts.values())
            .filter(a => !a.acknowledged)
            .length;
    }

    /**
     * Check if there are any critical alerts
     */
    hasCriticalAlerts(): boolean {
        return Array.from(this.activeAlerts.values())
            .some(a => a.level === ReadinessLevel.CRITICAL);
    }

    /**
     * Update configuration
     */
    updateConfig(enabled: boolean): void {
        this.notificationsEnabled = enabled;
    }

    /**
     * Clear all alerts
     */
    clearAll(): void {
        this.activeAlerts.clear();
        this.acknowledgedIds.clear();
    }
}

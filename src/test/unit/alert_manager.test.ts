/**
 * AG Telemetry - AlertManager Unit Tests
 * Tests for alert processing logic and state management
 * 
 * Note: These tests validate the pure logic algorithms used by AlertManager
 * without requiring the actual VS Code API. Integration tests that require
 * VS Code should use @vscode/test-electron.
 */

import { expect } from 'chai';
import { ReadinessLevel, FuelSystem, TelemetryAlert } from '../../types';
import { createFuelSystem } from '../helpers/factories';

describe('AlertManager Logic', () => {

    describe('shouldTriggerAlert', () => {
        // Simulating the shouldTriggerAlert logic
        function shouldTriggerAlert(system: FuelSystem): boolean {
            return system.readiness === ReadinessLevel.WARNING ||
                system.readiness === ReadinessLevel.CRITICAL;
        }

        it('should return true for WARNING state', () => {
            const system = createFuelSystem({
                readiness: ReadinessLevel.WARNING
            });
            expect(shouldTriggerAlert(system)).to.be.true;
        });

        it('should return true for CRITICAL state', () => {
            const system = createFuelSystem({
                readiness: ReadinessLevel.CRITICAL
            });
            expect(shouldTriggerAlert(system)).to.be.true;
        });

        it('should return false for NOMINAL state', () => {
            const system = createFuelSystem({
                readiness: ReadinessLevel.NOMINAL
            });
            expect(shouldTriggerAlert(system)).to.be.false;
        });

        it('should return false for CAUTION state', () => {
            const system = createFuelSystem({
                readiness: ReadinessLevel.CAUTION
            });
            expect(shouldTriggerAlert(system)).to.be.false;
        });

        it('should return false for OFFLINE state', () => {
            const system = createFuelSystem({
                readiness: ReadinessLevel.OFFLINE
            });
            expect(shouldTriggerAlert(system)).to.be.false;
        });
    });

    describe('generateAlertMessage', () => {
        // Simulating the generateAlertMessage logic
        function generateAlertMessage(level: ReadinessLevel, percentage: number): string {
            if (level === ReadinessLevel.CRITICAL) {
                return percentage === 0
                    ? 'Fuel depleted'
                    : `Critical: ${percentage}% fuel`;
            }
            return `Low fuel: ${percentage}%`;
        }

        it('should generate "Fuel depleted" for 0% critical', () => {
            const msg = generateAlertMessage(ReadinessLevel.CRITICAL, 0);
            expect(msg).to.equal('Fuel depleted');
        });

        it('should generate "Critical: X% fuel" for non-zero critical', () => {
            const msg = generateAlertMessage(ReadinessLevel.CRITICAL, 3);
            expect(msg).to.equal('Critical: 3% fuel');
        });

        it('should generate "Low fuel: X%" for warning', () => {
            const msg = generateAlertMessage(ReadinessLevel.WARNING, 15);
            expect(msg).to.equal('Low fuel: 15%');
        });

        it('should handle edge percentage values', () => {
            expect(generateAlertMessage(ReadinessLevel.CRITICAL, 1)).to.equal('Critical: 1% fuel');
            expect(generateAlertMessage(ReadinessLevel.CRITICAL, 5)).to.equal('Critical: 5% fuel');
            expect(generateAlertMessage(ReadinessLevel.WARNING, 20)).to.equal('Low fuel: 20%');
        });
    });

    describe('Alert State Management', () => {
        // Simulating the alert state management logic
        class MockAlertState {
            private activeAlerts: Map<string, TelemetryAlert> = new Map();
            private acknowledgedIds: Set<string> = new Set();

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

            private shouldTriggerAlert(system: FuelSystem): boolean {
                return system.readiness === ReadinessLevel.WARNING ||
                    system.readiness === ReadinessLevel.CRITICAL;
            }

            private triggerAlert(system: FuelSystem): void {
                const existingAlert = this.activeAlerts.get(system.systemId);
                const percentage = Math.round(system.fuelLevel * 100);

                const alert: TelemetryAlert = {
                    id: `alert-${system.systemId}`,
                    systemId: system.systemId,
                    systemDesignation: system.designation,
                    level: system.readiness,
                    message: this.generateAlertMessage(system.readiness, percentage),
                    timestamp: existingAlert?.timestamp ?? Date.now(),
                    acknowledged: existingAlert?.acknowledged ?? false
                };

                this.activeAlerts.set(system.systemId, alert);
            }

            private clearAlert(systemId: string): void {
                const alert = this.activeAlerts.get(systemId);
                if (alert) {
                    this.activeAlerts.delete(systemId);
                    this.acknowledgedIds.delete(alert.id);
                }
            }

            private generateAlertMessage(level: ReadinessLevel, percentage: number): string {
                if (level === ReadinessLevel.CRITICAL) {
                    return percentage === 0 ? 'Fuel depleted' : `Critical: ${percentage}% fuel`;
                }
                return `Low fuel: ${percentage}%`;
            }

            acknowledgeAlert(alertId: string): void {
                const alert = Array.from(this.activeAlerts.values())
                    .find(a => a.id === alertId);
                if (alert) {
                    alert.acknowledged = true;
                    this.acknowledgedIds.add(alertId);
                }
            }

            getActiveAlerts(): TelemetryAlert[] {
                return Array.from(this.activeAlerts.values());
            }

            getUnacknowledgedCount(): number {
                return Array.from(this.activeAlerts.values())
                    .filter(a => !a.acknowledged)
                    .length;
            }

            hasCriticalAlerts(): boolean {
                return Array.from(this.activeAlerts.values())
                    .some(a => a.level === ReadinessLevel.CRITICAL);
            }

            clearAll(): void {
                this.activeAlerts.clear();
                this.acknowledgedIds.clear();
            }
        }

        let alertState: MockAlertState;

        beforeEach(() => {
            alertState = new MockAlertState();
        });

        it('should create alerts for systems in WARNING state', () => {
            const systems: FuelSystem[] = [
                createFuelSystem({
                    systemId: 'warning-system',
                    designation: 'Warning System',
                    fuelLevel: 0.15,
                    readiness: ReadinessLevel.WARNING
                })
            ];

            const alerts = alertState.processTelemetry(systems);

            expect(alerts).to.have.lengthOf(1);
            expect(alerts[0].systemId).to.equal('warning-system');
            expect(alerts[0].level).to.equal(ReadinessLevel.WARNING);
        });

        it('should create alerts for systems in CRITICAL state', () => {
            const systems: FuelSystem[] = [
                createFuelSystem({
                    systemId: 'critical-system',
                    designation: 'Critical System',
                    fuelLevel: 0.03,
                    readiness: ReadinessLevel.CRITICAL
                })
            ];

            const alerts = alertState.processTelemetry(systems);

            expect(alerts).to.have.lengthOf(1);
            expect(alerts[0].level).to.equal(ReadinessLevel.CRITICAL);
        });

        it('should NOT create alerts for NOMINAL systems', () => {
            const systems: FuelSystem[] = [
                createFuelSystem({
                    systemId: 'nominal-system',
                    fuelLevel: 0.85,
                    readiness: ReadinessLevel.NOMINAL
                })
            ];

            const alerts = alertState.processTelemetry(systems);
            expect(alerts).to.have.lengthOf(0);
        });

        it('should NOT create alerts for CAUTION systems', () => {
            const systems: FuelSystem[] = [
                createFuelSystem({
                    systemId: 'caution-system',
                    fuelLevel: 0.35,
                    readiness: ReadinessLevel.CAUTION
                })
            ];

            const alerts = alertState.processTelemetry(systems);
            expect(alerts).to.have.lengthOf(0);
        });

        it('should clear alerts when system returns to NOMINAL', () => {
            // First, create an alert
            const warningSystem = createFuelSystem({
                systemId: 'test-system',
                fuelLevel: 0.15,
                readiness: ReadinessLevel.WARNING
            });
            alertState.processTelemetry([warningSystem]);
            expect(alertState.getActiveAlerts()).to.have.lengthOf(1);

            // Now system is nominal
            const nominalSystem = createFuelSystem({
                systemId: 'test-system',
                fuelLevel: 0.85,
                readiness: ReadinessLevel.NOMINAL
            });
            const alerts = alertState.processTelemetry([nominalSystem]);

            expect(alerts).to.have.lengthOf(0);
        });

        it('should clear alerts for systems no longer present', () => {
            // Create alert for a system
            const systems: FuelSystem[] = [
                createFuelSystem({
                    systemId: 'disappearing-system',
                    fuelLevel: 0.10,
                    readiness: ReadinessLevel.WARNING
                })
            ];
            alertState.processTelemetry(systems);
            expect(alertState.getActiveAlerts()).to.have.lengthOf(1);

            // System is no longer in telemetry
            const alerts = alertState.processTelemetry([]);
            expect(alerts).to.have.lengthOf(0);
        });

        it('should handle multiple systems with mixed states', () => {
            const systems: FuelSystem[] = [
                createFuelSystem({
                    systemId: 'nominal',
                    fuelLevel: 0.85,
                    readiness: ReadinessLevel.NOMINAL
                }),
                createFuelSystem({
                    systemId: 'warning',
                    fuelLevel: 0.15,
                    readiness: ReadinessLevel.WARNING
                }),
                createFuelSystem({
                    systemId: 'critical',
                    fuelLevel: 0.03,
                    readiness: ReadinessLevel.CRITICAL
                }),
                createFuelSystem({
                    systemId: 'caution',
                    fuelLevel: 0.35,
                    readiness: ReadinessLevel.CAUTION
                })
            ];

            const alerts = alertState.processTelemetry(systems);

            expect(alerts).to.have.lengthOf(2);
            const alertIds = alerts.map(a => a.systemId);
            expect(alertIds).to.include('warning');
            expect(alertIds).to.include('critical');
        });

        it('should acknowledge an existing alert', () => {
            const system = createFuelSystem({
                systemId: 'test-system',
                fuelLevel: 0.10,
                readiness: ReadinessLevel.WARNING
            });
            alertState.processTelemetry([system]);

            const alerts = alertState.getActiveAlerts();
            expect(alerts[0].acknowledged).to.be.false;

            alertState.acknowledgeAlert(alerts[0].id);

            const updatedAlerts = alertState.getActiveAlerts();
            expect(updatedAlerts[0].acknowledged).to.be.true;
        });

        it('should count only unacknowledged alerts', () => {
            const systems = [
                createFuelSystem({
                    systemId: 'system-1',
                    fuelLevel: 0.10,
                    readiness: ReadinessLevel.WARNING
                }),
                createFuelSystem({
                    systemId: 'system-2',
                    fuelLevel: 0.02,
                    readiness: ReadinessLevel.CRITICAL
                })
            ];

            alertState.processTelemetry(systems);
            expect(alertState.getUnacknowledgedCount()).to.equal(2);

            // Acknowledge one
            const alerts = alertState.getActiveAlerts();
            alertState.acknowledgeAlert(alerts[0].id);

            expect(alertState.getUnacknowledgedCount()).to.equal(1);
        });

        it('should detect critical alerts', () => {
            expect(alertState.hasCriticalAlerts()).to.be.false;

            const warningSystem = createFuelSystem({
                systemId: 'warning-system',
                fuelLevel: 0.15,
                readiness: ReadinessLevel.WARNING
            });
            alertState.processTelemetry([warningSystem]);
            expect(alertState.hasCriticalAlerts()).to.be.false;

            const criticalSystem = createFuelSystem({
                systemId: 'critical-system',
                fuelLevel: 0.03,
                readiness: ReadinessLevel.CRITICAL
            });
            alertState.processTelemetry([warningSystem, criticalSystem]);
            expect(alertState.hasCriticalAlerts()).to.be.true;
        });

        it('should clear all alerts', () => {
            const systems = [
                createFuelSystem({
                    systemId: 'system-1',
                    fuelLevel: 0.10,
                    readiness: ReadinessLevel.WARNING
                }),
                createFuelSystem({
                    systemId: 'system-2',
                    fuelLevel: 0.02,
                    readiness: ReadinessLevel.CRITICAL
                })
            ];

            alertState.processTelemetry(systems);
            expect(alertState.getActiveAlerts()).to.have.lengthOf(2);

            alertState.clearAll();
            expect(alertState.getActiveAlerts()).to.have.lengthOf(0);
        });

        it('should track escalation from WARNING to CRITICAL', () => {
            // Start with warning
            let system = createFuelSystem({
                systemId: 'escalating-system',
                designation: 'Escalating System',
                fuelLevel: 0.15,
                readiness: ReadinessLevel.WARNING
            });
            alertState.processTelemetry([system]);

            let alert = alertState.getActiveAlerts()[0];
            expect(alert.level).to.equal(ReadinessLevel.WARNING);

            // Escalate to critical
            system = createFuelSystem({
                systemId: 'escalating-system',
                designation: 'Escalating System',
                fuelLevel: 0.03,
                readiness: ReadinessLevel.CRITICAL
            });
            alertState.processTelemetry([system]);

            alert = alertState.getActiveAlerts()[0];
            expect(alert.level).to.equal(ReadinessLevel.CRITICAL);
        });
    });
});

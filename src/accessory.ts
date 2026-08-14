import type { PlatformAccessory, Service } from 'homebridge';

import type { BetterKeyPlatform } from './platform';
import type { ParkedAtHomeEvent, Vehicle } from './types/api';

const MOTION_SERVICE_SUBTYPE = 'betterkey-parked-at-home';

/** How long the motion sensor stays active per event. Chosen for HomeKit automation triggers. */
export const PULSE_DURATION_MILLISECONDS = 30_000;

interface StoredProcessedEvent {
  id: string;
  expiresAtMs: number;
}

/** Result of dispatching one event, exposed for tests and verbose logging. */
export type EventOutcome = 'pulsed' | 'seen' | 'expired' | 'invalid_timestamp';

export class ParkedAtHomeAccessory {
  private readonly motionService: Service;
  private readonly processed = new Map<string, number>();
  private clearTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly platform: BetterKeyPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly vehicle: Vehicle,
  ) {
    const model = vehicle.year ? `${vehicle.model} (${vehicle.year})` : vehicle.model;
    accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, vehicle.make)
      .setCharacteristic(this.platform.Characteristic.Model, model)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, vehicle.id);

    const serviceName = `${vehicle.displayName} Parked at Home`;
    this.motionService =
      accessory.getServiceById(this.platform.Service.MotionSensor, MOTION_SERVICE_SUBTYPE) ??
      accessory.addService(this.platform.Service.MotionSensor, serviceName, MOTION_SERVICE_SUBTYPE);
    this.motionService
      .setCharacteristic(this.platform.Characteristic.Name, serviceName)
      .updateCharacteristic(this.platform.Characteristic.MotionDetected, false);

    const stored = accessory.context.processedEvents;
    if (Array.isArray(stored)) {
      for (const entry of stored as unknown[]) {
        if (
          entry !== null &&
          typeof entry === 'object' &&
          typeof (entry as StoredProcessedEvent).id === 'string' &&
          Number.isFinite((entry as StoredProcessedEvent).expiresAtMs)
        ) {
          const { id, expiresAtMs } = entry as StoredProcessedEvent;
          this.processed.set(id, expiresAtMs);
        }
      }
    }
  }

  get vehicleId(): string {
    return this.vehicle.id;
  }

  get displayName(): string {
    return this.vehicle.displayName;
  }

  /**
   * Dispatch one event from the poll response. New events pulse the sensor active for
   * {@link PULSE_DURATION_MILLISECONDS}; already-processed events are ignored so a restart or
   * a duplicate poll response cannot replay the same automation.
   */
  handleEvent(event: ParkedAtHomeEvent, now: Date = new Date()): EventOutcome {
    this.pruneExpired(now);

    if (this.processed.has(event.id)) {
      return 'seen';
    }

    const expiresAtMs = Date.parse(event.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      return 'invalid_timestamp';
    }
    if (expiresAtMs <= now.getTime()) {
      return 'expired';
    }

    this.processed.set(event.id, expiresAtMs);
    this.persist();
    this.pulse();
    return 'pulsed';
  }

  /** Cancel any pending motion-reset timer. Called on Homebridge shutdown. */
  shutdown(): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = undefined;
    }
  }

  private pulse(): void {
    this.motionService.updateCharacteristic(this.platform.Characteristic.MotionDetected, true);
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
    }
    this.clearTimer = setTimeout(() => {
      this.motionService.updateCharacteristic(this.platform.Characteristic.MotionDetected, false);
      this.clearTimer = undefined;
    }, PULSE_DURATION_MILLISECONDS);
    if (typeof this.clearTimer === 'object' && this.clearTimer && 'unref' in this.clearTimer) {
      (this.clearTimer as { unref: () => void }).unref();
    }
  }

  private pruneExpired(now: Date): void {
    const nowMs = now.getTime();
    let changed = false;
    for (const [id, expiresAtMs] of this.processed) {
      if (expiresAtMs <= nowMs) {
        this.processed.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.persist();
    }
  }

  private persist(): void {
    const entries: StoredProcessedEvent[] = [];
    for (const [id, expiresAtMs] of this.processed) {
      entries.push({ id, expiresAtMs });
    }
    this.accessory.context.processedEvents = entries;
  }
}

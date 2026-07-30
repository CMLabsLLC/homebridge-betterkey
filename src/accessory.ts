import type { PlatformAccessory, Service } from 'homebridge';

import { GENERAL_FAULT, renderState } from './freshness';
import type { BetterKeyPlatform } from './platform';
import type { Vehicle, VehicleTelemetry } from './types/telemetry';

const WINDOWS_SERVICE_SUBTYPE = 'betterkey-windows';
const LAST_REPORTED_SERVICE_SUBTYPE = 'betterkey-last-reported';

export class BetterKeyVehicleAccessory {
  private readonly windowsService: Service;
  private readonly lastReportedService: Service;
  private unsupportedWarningLogged = false;
  private lastOemUpdatedAt?: Date;

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

    const windowsName = `${vehicle.displayName} Windows`;
    this.windowsService =
      accessory.getServiceById(this.platform.Service.ContactSensor, WINDOWS_SERVICE_SUBTYPE) ??
      accessory.addService(
        this.platform.Service.ContactSensor,
        windowsName,
        WINDOWS_SERVICE_SUBTYPE,
      );
    this.windowsService
      .setCharacteristic(this.platform.Characteristic.Name, windowsName)
      .updateCharacteristic(this.platform.Characteristic.StatusFault, GENERAL_FAULT);

    const lastReportedName = `${vehicle.displayName} Last Reported`;
    this.lastReportedService =
      accessory.getServiceById(this.platform.Service.Battery, LAST_REPORTED_SERVICE_SUBTYPE) ??
      accessory.addService(
        this.platform.Service.Battery,
        lastReportedName,
        LAST_REPORTED_SERVICE_SUBTYPE,
      );
    this.lastReportedService
      .setCharacteristic(this.platform.Characteristic.Name, lastReportedName)
      .setCharacteristic(
        this.platform.Characteristic.ChargingState,
        this.platform.Characteristic.ChargingState.NOT_CHARGING,
      )
      .setCharacteristic(
        this.platform.Characteristic.StatusLowBattery,
        this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      )
      .setCharacteristic(this.platform.Characteristic.BatteryLevel, 100);
  }

  update(telemetry: VehicleTelemetry, now = new Date()): void {
    const windows = telemetry.signals?.windows;
    if (!telemetry.capabilities.windows || !windows) {
      this.windowsService.updateCharacteristic(
        this.platform.Characteristic.StatusFault,
        GENERAL_FAULT,
      );
      this.updateLastReported(now);
      if (!this.unsupportedWarningLogged) {
        this.platform.log.warn(
          '%s does not currently provide compatible window telemetry.',
          this.vehicle.displayName,
        );
        this.unsupportedWarningLogged = true;
      }
      return;
    }

    this.unsupportedWarningLogged = false;
    const rendered = renderState(
      windows.allClosed,
      windows.oemUpdatedAt,
      now,
      this.platform.resolvedConfig.stalenessThresholdMinutes,
    );
    const parsedOemUpdatedAt = new Date(windows.oemUpdatedAt);
    if (!Number.isNaN(parsedOemUpdatedAt.getTime())) {
      this.lastOemUpdatedAt = parsedOemUpdatedAt;
    }

    if (rendered.hkValue !== null) {
      this.windowsService.updateCharacteristic(
        this.platform.Characteristic.ContactSensorState,
        rendered.hkValue,
      );
    }
    this.windowsService.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      rendered.statusFault,
    );

    // HomeKit battery level is limited to 0...100. This deliberately uses that widely
    // supported surface to expose age in minutes, capped at 100.
    this.lastReportedService.updateCharacteristic(
      this.platform.Characteristic.BatteryLevel,
      Math.min(100, rendered.ageMinutes ?? 100),
    );

    if (this.platform.resolvedConfig.verboseLogging) {
      this.platform.log.debug(
        '%s telemetry: oemUpdatedAt=%s retrievedAt=%s ageMinutes=%s renderedState=%s statusFault=%d',
        this.vehicle.displayName,
        windows.oemUpdatedAt,
        windows.retrievedAt,
        rendered.ageMinutes ?? 'unknown',
        rendered.hkValue === null ? 'unknown' : rendered.hkValue === 0 ? 'closed' : 'open',
        rendered.statusFault,
      );
    }
  }

  markUnavailable(message: string, now = new Date()): void {
    this.windowsService.updateCharacteristic(
      this.platform.Characteristic.StatusFault,
      GENERAL_FAULT,
    );
    this.updateLastReported(now);
    if (this.platform.resolvedConfig.verboseLogging) {
      this.platform.log.debug('%s telemetry unavailable: %s', this.vehicle.displayName, message);
    }
  }

  private updateLastReported(now: Date): void {
    const ageMinutes = this.lastOemUpdatedAt
      ? Math.max(0, Math.floor((now.getTime() - this.lastOemUpdatedAt.getTime()) / 60_000))
      : 100;
    this.lastReportedService.updateCharacteristic(
      this.platform.Characteristic.BatteryLevel,
      Math.min(100, ageMinutes),
    );
  }
}

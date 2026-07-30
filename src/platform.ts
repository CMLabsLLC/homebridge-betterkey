import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { BetterKeyVehicleAccessory } from './accessory';
import { type BetterKeyPlatformConfig, type ResolvedConfig, resolveConfig } from './config';
import { PLATFORM_NAME, PLUGIN_NAME, resolveApiBaseUrl } from './settings';
import { TelemetryClient, type TelemetryResult } from './telemetry-client';
import type { Vehicle } from './types/telemetry';

export class BetterKeyPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly resolvedConfig: ResolvedConfig;

  private readonly cachedAccessories = new Map<string, PlatformAccessory>();
  private readonly handlers = new Map<string, BetterKeyVehicleAccessory>();
  private readonly client: TelemetryClient;
  private pollTimer?: NodeJS.Timeout;
  private authErrorLogged = false;

  constructor(
    public readonly log: Logging,
    config: BetterKeyPlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    const resolved = resolveConfig(config);
    if (!resolved) {
      log.error('BetterKey is not configured: add an API key generated in BetterKey Settings.');
      this.resolvedConfig = {
        apiKey: '',
        pollIntervalMinutes: 15,
        stalenessThresholdMinutes: 360,
        verboseLogging: false,
      };
      this.client = new TelemetryClient(resolveApiBaseUrl(), '');
      return;
    }

    this.resolvedConfig = resolved;
    let baseUrl: string;
    try {
      baseUrl = resolveApiBaseUrl();
    } catch (error) {
      log.error(
        'BetterKey API origin override is invalid: %s',
        error instanceof Error ? error.message : 'unknown error',
      );
      this.client = new TelemetryClient('https://invalid.invalid', resolved.apiKey);
      return;
    }
    this.client = new TelemetryClient(baseUrl, resolved.apiKey);

    this.api.on('didFinishLaunching', () => {
      void this.discoverVehicles();
    });
    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  private async discoverVehicles(): Promise<void> {
    const result = await this.client.getVehicles();
    if (!result.ok) {
      this.logClientError('discover vehicles', result);
      return;
    }

    const discoveredUuids = new Set<string>();
    for (const vehicle of result.data.vehicles) {
      const uuid = this.api.hap.uuid.generate(`betterkey:${vehicle.id}`);
      discoveredUuids.add(uuid);
      const cached = this.cachedAccessories.get(uuid);
      if (cached) {
        cached.context.vehicle = vehicle;
        cached.updateDisplayName(vehicle.displayName);
        this.api.updatePlatformAccessories([cached]);
        this.handlers.set(vehicle.id, new BetterKeyVehicleAccessory(this, cached, vehicle));
        this.log.info('Restored %s from the Homebridge cache.', vehicle.displayName);
      } else {
        const accessory = new this.api.platformAccessory(vehicle.displayName, uuid);
        accessory.context.vehicle = vehicle;
        this.handlers.set(vehicle.id, new BetterKeyVehicleAccessory(this, accessory, vehicle));
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.log.info('Added %s.', vehicle.displayName);
      }
    }

    const removed: PlatformAccessory[] = [];
    for (const [uuid, accessory] of this.cachedAccessories) {
      if (!discoveredUuids.has(uuid)) {
        removed.push(accessory);
        this.log.info('Removed %s because it is no longer in BetterKey.', accessory.displayName);
      }
    }
    if (removed.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removed);
    }

    await this.pollAllVehicles(result.data.vehicles);
    this.pollTimer = setInterval(
      () => void this.pollAllVehicles(result.data.vehicles),
      this.resolvedConfig.pollIntervalMinutes * 60_000,
    );
  }

  private async pollAllVehicles(vehicles: Vehicle[]): Promise<void> {
    await Promise.all(vehicles.map((vehicle) => this.pollVehicle(vehicle)));
  }

  private async pollVehicle(vehicle: Vehicle): Promise<void> {
    const result = await this.client.getVehicleTelemetry(vehicle.id);
    const handler = this.handlers.get(vehicle.id);
    if (!handler) {
      return;
    }

    if (!result.ok) {
      handler.markUnavailable(result.message);
      this.logClientError(`poll ${vehicle.displayName}`, result);
      return;
    }

    this.authErrorLogged = false;
    handler.update(result.data);
  }

  private logClientError(
    operation: string,
    result: Exclude<TelemetryResult<unknown>, { ok: true }>,
  ): void {
    if (result.kind === 'unauthorized') {
      if (!this.authErrorLogged) {
        this.log.error(
          'API key invalid or revoked. Regenerate it in BetterKey Settings and update the Homebridge configuration.',
        );
        this.authErrorLogged = true;
      }
      return;
    }

    this.log.warn('Unable to %s: %s', operation, result.message);
  }
}

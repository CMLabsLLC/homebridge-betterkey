import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { type ApiResult, BetterKeyApiClient } from './api-client';
import { ParkedAtHomeAccessory } from './accessory';
import { type BetterKeyPlatformConfig, type ResolvedConfig, resolveConfig } from './config';
import { PLATFORM_NAME, PLUGIN_NAME, resolveApiBaseUrl } from './settings';
import type { ParkedAtHomeEvent } from './types/api';

export class BetterKeyPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly resolvedConfig: ResolvedConfig;

  private readonly cachedAccessories = new Map<string, PlatformAccessory>();
  private readonly handlers = new Map<string, ParkedAtHomeAccessory>();
  private readonly client: BetterKeyApiClient;
  private pollTimer?: ReturnType<typeof setInterval>;
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
        pollIntervalSeconds: 60,
        verboseLogging: false,
      };
      this.client = new BetterKeyApiClient(resolveApiBaseUrl(), '');
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
      this.client = new BetterKeyApiClient('https://invalid.invalid', resolved.apiKey);
      return;
    }
    this.client = new BetterKeyApiClient(baseUrl, resolved.apiKey);

    this.api.on('didFinishLaunching', () => {
      void this.discoverVehicles();
    });
    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = undefined;
      }
      for (const handler of this.handlers.values()) {
        handler.shutdown();
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
        this.handlers.set(vehicle.id, new ParkedAtHomeAccessory(this, cached, vehicle));
        this.log.info('Restored %s from the Homebridge cache.', vehicle.displayName);
      } else {
        const accessory = new this.api.platformAccessory(vehicle.displayName, uuid);
        accessory.context.vehicle = vehicle;
        this.handlers.set(vehicle.id, new ParkedAtHomeAccessory(this, accessory, vehicle));
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

    await this.pollEvents();
    this.pollTimer = setInterval(
      () => void this.pollEvents(),
      this.resolvedConfig.pollIntervalSeconds * 1_000,
    );
    if (typeof this.pollTimer === 'object' && this.pollTimer && 'unref' in this.pollTimer) {
      (this.pollTimer as { unref: () => void }).unref();
    }
  }

  private async pollEvents(): Promise<void> {
    const result = await this.client.getParkedAtHomeEvents();
    if (!result.ok) {
      this.logClientError('poll Parked at Home events', result);
      return;
    }

    this.authErrorLogged = false;
    this.dispatchEvents(result.data.events);
  }

  /** Exposed for tests. Routes a batch of events to their target accessory handlers. */
  dispatchEvents(events: readonly ParkedAtHomeEvent[], now: Date = new Date()): void {
    for (const event of events) {
      const handler = this.handlers.get(event.vehicleId);
      if (!handler) {
        if (this.resolvedConfig.verboseLogging) {
          this.log.debug('Ignoring Parked at Home event for unknown vehicle %s.', event.vehicleId);
        }
        continue;
      }
      const outcome = handler.handleEvent(event, now);
      if (outcome === 'pulsed') {
        this.log.info('%s parked at Home.', handler.displayName);
      } else if (this.resolvedConfig.verboseLogging) {
        this.log.debug(
          'Skipped Parked at Home event id=%s for %s (%s).',
          event.id,
          handler.displayName,
          outcome,
        );
      }
    }
  }

  private logClientError(
    operation: string,
    result: Exclude<ApiResult<unknown>, { ok: true }>,
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

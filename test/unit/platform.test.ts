import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { API } from 'homebridge';

import { PULSE_DURATION_MILLISECONDS } from '../../src/accessory';
import { BetterKeyPlatform } from '../../src/platform';
import type { BetterKeyPlatformConfig } from '../../src/config';
import type { ParkedAtHomeEvent } from '../../src/types/api';
import {
  FAKE_CHARACTERISTICS,
  FAKE_SERVICES,
  type FakeAccessory,
  createFakeAccessory,
  createFakeLog,
} from './homebridge-fakes';

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

function jsonResponse(name: string): Response {
  return new Response(fixture(name), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

interface FakeApi {
  api: API;
  registered: FakeAccessory[];
  unregistered: FakeAccessory[];
  updated: FakeAccessory[];
  fire: (event: 'didFinishLaunching' | 'shutdown') => void;
}

function createFakeApi(): FakeApi {
  const listeners = new Map<string, () => void>();
  const registered: FakeAccessory[] = [];
  const unregistered: FakeAccessory[] = [];
  const updated: FakeAccessory[] = [];
  const api = {
    hap: {
      Service: FAKE_SERVICES,
      Characteristic: FAKE_CHARACTERISTICS,
      uuid: {
        generate(input: string) {
          return `uuid:${input}`;
        },
      },
    },
    on(event: string, listener: () => void) {
      listeners.set(event, listener);
      return api;
    },
    platformAccessory: function (displayName: string, uuid: string) {
      return createFakeAccessory(displayName, uuid);
    } as unknown as API['platformAccessory'],
    registerPlatformAccessories(_pluginName: string, _platformName: string, list: FakeAccessory[]) {
      registered.push(...list);
    },
    updatePlatformAccessories(list: FakeAccessory[]) {
      updated.push(...list);
    },
    unregisterPlatformAccessories(
      _pluginName: string,
      _platformName: string,
      list: FakeAccessory[],
    ) {
      unregistered.push(...list);
    },
  } as unknown as API;

  return {
    api,
    registered,
    unregistered,
    updated,
    fire(event) {
      const listener = listeners.get(event);
      if (!listener) {
        throw new Error(`No listener registered for ${event}`);
      }
      listener();
    },
  };
}

const CONFIG: BetterKeyPlatformConfig = {
  name: 'BetterKey',
  platform: 'BetterKey',
  apiKey: 'bk_secret',
  pollIntervalSeconds: 60,
};

describe('BetterKeyPlatform.dispatchEvents', () => {
  it('routes each event to the accessory matching its vehicleId', () => {
    const log = createFakeLog();
    const platform = new BetterKeyPlatform(
      log as unknown as ConstructorParameters<typeof BetterKeyPlatform>[0],
      CONFIG,
      createFakeApi().api,
    );
    // Reach into the handlers map to stage two accessories without going through the
    // fetcher; dispatchEvents is the boundary the poll loop calls into.
    const handlerA = {
      vehicleId: 'veh-a',
      displayName: 'A',
      handleEvent: jest.fn().mockReturnValue('pulsed'),
      shutdown: jest.fn(),
    };
    const handlerB = {
      vehicleId: 'veh-b',
      displayName: 'B',
      handleEvent: jest.fn().mockReturnValue('seen'),
      shutdown: jest.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (platform as any).handlers.set('veh-a', handlerA);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (platform as any).handlers.set('veh-b', handlerB);

    const now = new Date('2026-08-13T14:22:03Z');
    const events: ParkedAtHomeEvent[] = [
      { id: 'e1', type: 'parked_at_home', vehicleId: 'veh-a', occurredAt: '', expiresAt: '' },
      { id: 'e2', type: 'parked_at_home', vehicleId: 'veh-b', occurredAt: '', expiresAt: '' },
      { id: 'e3', type: 'parked_at_home', vehicleId: 'veh-unknown', occurredAt: '', expiresAt: '' },
    ];

    platform.dispatchEvents(events, now);

    expect(handlerA.handleEvent).toHaveBeenCalledWith(events[0], now);
    expect(handlerB.handleEvent).toHaveBeenCalledWith(events[1], now);
    expect(log.info).toHaveBeenCalledWith('%s parked at Home.', 'A');
    expect(log.info).not.toHaveBeenCalledWith('%s parked at Home.', 'B');
  });
});

describe('BetterKeyPlatform polling', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['performance'] });
    jest.setSystemTime(new Date('2026-08-13T14:22:03Z'));
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('polls the events endpoint on the configured cadence and pulses new events', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse('vehicles_list.json'))
      .mockResolvedValueOnce(jsonResponse('homebridge_events_empty.json'))
      .mockResolvedValueOnce(jsonResponse('homebridge_events_single.json'));

    const { api, registered, fire } = createFakeApi();
    const log = createFakeLog();
    new BetterKeyPlatform(
      log as unknown as ConstructorParameters<typeof BetterKeyPlatform>[0],
      CONFIG,
      api,
    );

    fire('didFinishLaunching');
    // Flush the discoverVehicles + first pollEvents chain under fake timers.
    await jest.advanceTimersByTimeAsync(0);

    // Two vehicles registered from the fixture.
    expect(registered).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://betterkey.xyz/v1/vehicles');
    expect(fetchMock.mock.calls[1][0]).toBe('https://betterkey.xyz/v1/homebridge/events');

    // Advance to the second poll interval and let it run.
    await jest.advanceTimersByTimeAsync(CONFIG.pollIntervalSeconds! * 1_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe('https://betterkey.xyz/v1/homebridge/events');

    const foresterAccessory = registered.find(
      (accessory) => accessory.UUID === 'uuid:betterkey:veh-forester-2023',
    );
    const motionService = foresterAccessory?.getServiceById(
      FAKE_SERVICES.MotionSensor,
      'betterkey-parked-at-home',
    );
    expect(motionService?.characteristics.get(FAKE_CHARACTERISTICS.MotionDetected)).toBe(true);

    jest.advanceTimersByTime(PULSE_DURATION_MILLISECONDS);
    expect(motionService?.characteristics.get(FAKE_CHARACTERISTICS.MotionDetected)).toBe(false);
  });

  it('surfaces one auth error and does not repeat the log on every poll', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 })) // getVehicles
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    const { api, fire } = createFakeApi();
    const log = createFakeLog();
    new BetterKeyPlatform(
      log as unknown as ConstructorParameters<typeof BetterKeyPlatform>[0],
      CONFIG,
      api,
    );

    fire('didFinishLaunching');
    await jest.advanceTimersByTimeAsync(0);

    const authErrors = log.error.mock.calls.filter(
      ([message]) => typeof message === 'string' && message.includes('API key invalid or revoked'),
    );
    expect(authErrors.length).toBe(1);
  });
});

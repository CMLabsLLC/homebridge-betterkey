import type { PlatformAccessory } from 'homebridge';

import { ParkedAtHomeAccessory, PULSE_DURATION_MILLISECONDS } from '../../src/accessory';
import type { BetterKeyPlatform } from '../../src/platform';
import type { ParkedAtHomeEvent, Vehicle } from '../../src/types/api';
import {
  FAKE_CHARACTERISTICS,
  FAKE_SERVICES,
  type FakeAccessory,
  type FakePlatform,
  createFakeAccessory,
  createFakePlatform,
} from './homebridge-fakes';

const VEHICLE: Vehicle = {
  id: 'veh-forester-2023',
  displayName: 'Forester',
  make: 'Subaru',
  model: 'Forester',
  year: 2023,
  color: 'SolidBlack',
};

function makeEvent(overrides: Partial<ParkedAtHomeEvent> = {}): ParkedAtHomeEvent {
  return {
    id: 'evt-1',
    type: 'parked_at_home',
    vehicleId: VEHICLE.id,
    occurredAt: '2026-08-13T14:00:00Z',
    expiresAt: '2026-08-14T14:00:00Z',
    ...overrides,
  };
}

function make(): {
  platform: FakePlatform;
  accessory: FakeAccessory;
  handler: ParkedAtHomeAccessory;
  motion: () => unknown;
} {
  const platform = createFakePlatform();
  const accessory = createFakeAccessory(VEHICLE.displayName);
  const handler = new ParkedAtHomeAccessory(
    platform as unknown as BetterKeyPlatform,
    accessory as unknown as PlatformAccessory,
    VEHICLE,
  );
  const motion = () => {
    const service = accessory.getServiceById(
      FAKE_SERVICES.MotionSensor,
      'betterkey-parked-at-home',
    );
    return service?.characteristics.get(FAKE_CHARACTERISTICS.MotionDetected);
  };
  return { platform, accessory, handler, motion };
}

describe('ParkedAtHomeAccessory', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['performance'] });
    jest.setSystemTime(new Date('2026-08-13T14:22:03Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers a MotionSensor service and starts inactive', () => {
    const { motion } = make();
    expect(motion()).toBe(false);
  });

  it('pulses the motion sensor active for 30 seconds on a new event', () => {
    const { handler, motion } = make();

    const outcome = handler.handleEvent(makeEvent());

    expect(outcome).toBe('pulsed');
    expect(motion()).toBe(true);

    jest.advanceTimersByTime(PULSE_DURATION_MILLISECONDS - 1);
    expect(motion()).toBe(true);

    jest.advanceTimersByTime(1);
    expect(motion()).toBe(false);
  });

  it('does not pulse for an event id that has already been processed', () => {
    const { handler, motion } = make();

    expect(handler.handleEvent(makeEvent())).toBe('pulsed');
    jest.advanceTimersByTime(PULSE_DURATION_MILLISECONDS);
    expect(motion()).toBe(false);

    expect(handler.handleEvent(makeEvent())).toBe('seen');
    expect(motion()).toBe(false);
  });

  it('persists processed event ids to accessory.context to survive restarts', () => {
    const platform = createFakePlatform();
    const accessory = createFakeAccessory(VEHICLE.displayName);
    const first = new ParkedAtHomeAccessory(
      platform as unknown as BetterKeyPlatform,
      accessory as unknown as PlatformAccessory,
      VEHICLE,
    );
    first.handleEvent(makeEvent({ id: 'evt-persistent' }));

    expect(accessory.context.processedEvents).toEqual([
      { id: 'evt-persistent', expiresAtMs: Date.parse('2026-08-14T14:00:00Z') },
    ]);

    // Simulate a Homebridge restart: same accessory (context survives), fresh handler.
    const second = new ParkedAtHomeAccessory(
      platform as unknown as BetterKeyPlatform,
      accessory as unknown as PlatformAccessory,
      VEHICLE,
    );
    const outcome = second.handleEvent(makeEvent({ id: 'evt-persistent' }));

    expect(outcome).toBe('seen');
    const service = accessory.getServiceById(
      FAKE_SERVICES.MotionSensor,
      'betterkey-parked-at-home',
    );
    expect(service?.characteristics.get(FAKE_CHARACTERISTICS.MotionDetected)).toBe(false);
  });

  it('skips expired events without pulsing and without recording them', () => {
    const { handler, motion, accessory } = make();

    const outcome = handler.handleEvent(
      makeEvent({ id: 'evt-expired', expiresAt: '2026-08-13T14:00:00Z' }),
    );

    expect(outcome).toBe('expired');
    expect(motion()).toBe(false);
    expect(accessory.context.processedEvents ?? []).toEqual([]);
  });

  it('skips events with an unparseable expiresAt timestamp', () => {
    const { handler, motion } = make();

    const outcome = handler.handleEvent(makeEvent({ expiresAt: 'not-a-timestamp' }));

    expect(outcome).toBe('invalid_timestamp');
    expect(motion()).toBe(false);
  });

  it('prunes expired processed ids so the store cannot grow unboundedly', () => {
    const { handler, accessory } = make();

    handler.handleEvent(makeEvent({ id: 'evt-old', expiresAt: '2026-08-13T14:30:00Z' }));
    expect(accessory.context.processedEvents).toHaveLength(1);

    jest.setSystemTime(new Date('2026-08-13T15:00:00Z'));
    handler.handleEvent(makeEvent({ id: 'evt-new', expiresAt: '2026-08-14T15:00:00Z' }));

    const stored = accessory.context.processedEvents as { id: string }[];
    expect(stored.map((entry) => entry.id)).toEqual(['evt-new']);
  });

  it('extends the pulse when a second new event arrives before the first resets', () => {
    const { handler, motion } = make();

    handler.handleEvent(makeEvent({ id: 'evt-a' }));
    jest.advanceTimersByTime(PULSE_DURATION_MILLISECONDS - 5_000);
    expect(motion()).toBe(true);

    handler.handleEvent(makeEvent({ id: 'evt-b' }));
    // The 30s window restarts from the second event, not the first.
    jest.advanceTimersByTime(PULSE_DURATION_MILLISECONDS - 1);
    expect(motion()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(motion()).toBe(false);
  });
});

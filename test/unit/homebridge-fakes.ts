/**
 * Minimal fakes of the Homebridge platform surface the plugin actually uses.
 *
 * The real Homebridge package is only imported for its TypeScript types (bundled by the
 * consumer at runtime). These fakes let unit tests exercise accessory + platform behavior
 * without pulling in a live Homebridge process.
 */

export const FAKE_SERVICES = {
  AccessoryInformation: Symbol('AccessoryInformation'),
  MotionSensor: Symbol('MotionSensor'),
};

export const FAKE_CHARACTERISTICS = {
  Manufacturer: Symbol('Manufacturer'),
  Model: Symbol('Model'),
  SerialNumber: Symbol('SerialNumber'),
  Name: Symbol('Name'),
  MotionDetected: Symbol('MotionDetected'),
};

export interface FakeService {
  readonly type: symbol;
  readonly subtype?: string;
  readonly characteristics: Map<symbol, unknown>;
  setCharacteristic(name: symbol, value: unknown): FakeService;
  updateCharacteristic(name: symbol, value: unknown): FakeService;
}

export function createFakeService(type: symbol, subtype?: string): FakeService {
  const characteristics = new Map<symbol, unknown>();
  const service: FakeService = {
    type,
    subtype,
    characteristics,
    setCharacteristic(name: symbol, value: unknown) {
      characteristics.set(name, value);
      return service;
    },
    updateCharacteristic(name: symbol, value: unknown) {
      characteristics.set(name, value);
      return service;
    },
  };
  return service;
}

export interface FakeAccessory {
  displayName: string;
  UUID: string;
  context: Record<string, unknown>;
  services: FakeService[];
  getService(type: symbol): FakeService | undefined;
  getServiceById(type: symbol, subtype: string): FakeService | undefined;
  addService(type: symbol, name: string, subtype: string): FakeService;
  updateDisplayName(name: string): void;
}

export function createFakeAccessory(displayName: string, uuid = displayName): FakeAccessory {
  const services: FakeService[] = [createFakeService(FAKE_SERVICES.AccessoryInformation)];
  const accessory: FakeAccessory = {
    displayName,
    UUID: uuid,
    context: {},
    services,
    getService(type) {
      return services.find((service) => service.type === type && service.subtype === undefined);
    },
    getServiceById(type, subtype) {
      return services.find((service) => service.type === type && service.subtype === subtype);
    },
    addService(type, _name, subtype) {
      const service = createFakeService(type, subtype);
      services.push(service);
      return service;
    },
    updateDisplayName(name) {
      accessory.displayName = name;
    },
  };
  return accessory;
}

export interface FakeLog {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

export function createFakeLog(): FakeLog {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

export interface FakePlatform {
  Service: typeof FAKE_SERVICES;
  Characteristic: typeof FAKE_CHARACTERISTICS;
  log: FakeLog;
  resolvedConfig: { apiKey: string; pollIntervalSeconds: number; verboseLogging: boolean };
}

export function createFakePlatform(overrides: Partial<FakePlatform> = {}): FakePlatform {
  return {
    Service: FAKE_SERVICES,
    Characteristic: FAKE_CHARACTERISTICS,
    log: createFakeLog(),
    resolvedConfig: { apiKey: 'bk_secret', pollIntervalSeconds: 60, verboseLogging: false },
    ...overrides,
  };
}

import type { VehicleTelemetry, VehiclesResponse } from './types/telemetry';

export type TelemetryErrorKind =
  'unauthorized' | 'rate_limited' | 'server' | 'http' | 'network' | 'invalid_response';

export type TelemetryResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      kind: TelemetryErrorKind;
      message: string;
      status?: number;
      retryAfterSeconds?: number;
    };

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type Sleeper = (milliseconds: number) => Promise<void>;

const DEFAULT_MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MILLISECONDS = 500;
const MAX_RETRY_DELAY_MILLISECONDS = 30_000;

export class TelemetryClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetcher: Fetcher = globalThis.fetch,
    private readonly sleep: Sleeper = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly maxRetries: number = DEFAULT_MAX_RETRIES,
  ) {}

  getVehicles(): Promise<TelemetryResult<VehiclesResponse>> {
    return this.request('/v1/vehicles', isVehiclesResponse);
  }

  getVehicleTelemetry(vehicleId: string): Promise<TelemetryResult<VehicleTelemetry>> {
    return this.request(
      `/v1/vehicles/${encodeURIComponent(vehicleId)}/telemetry`,
      isVehicleTelemetry,
    );
  }

  private async request<T>(
    path: string,
    validate: (value: unknown) => value is T,
  ): Promise<TelemetryResult<T>> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetcher(`${this.baseUrl}${path}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
        });
      } catch (error) {
        if (attempt < this.maxRetries) {
          await this.sleep(retryDelayMilliseconds(attempt));
          continue;
        }
        return {
          ok: false,
          kind: 'network',
          message: error instanceof Error ? error.message : 'Network request failed',
        };
      }

      if (response.status === 401) {
        return {
          ok: false,
          kind: 'unauthorized',
          status: response.status,
          message: 'API key invalid or revoked',
        };
      }

      if (response.status === 429 || response.status >= 500) {
        const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
        if (attempt < this.maxRetries) {
          const delay = retryAfterSeconds
            ? retryAfterSeconds * 1_000
            : retryDelayMilliseconds(attempt);
          await this.sleep(Math.min(delay, MAX_RETRY_DELAY_MILLISECONDS));
          continue;
        }
        return {
          ok: false,
          kind: response.status === 429 ? 'rate_limited' : 'server',
          status: response.status,
          retryAfterSeconds,
          message:
            response.status === 429
              ? 'BetterKey API rate limit exceeded'
              : 'BetterKey API is temporarily unavailable',
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          kind: 'http',
          status: response.status,
          message: `BetterKey API returned HTTP ${response.status}`,
        };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return {
          ok: false,
          kind: 'invalid_response',
          status: response.status,
          message: 'BetterKey API returned invalid JSON',
        };
      }

      if (!validate(body)) {
        return {
          ok: false,
          kind: 'invalid_response',
          status: response.status,
          message: 'BetterKey API response did not match the telemetry contract',
        };
      }

      return { ok: true, data: body };
    }

    return { ok: false, kind: 'network', message: 'Request attempts exhausted' };
  }
}

function retryDelayMilliseconds(attempt: number): number {
  return Math.min(BASE_RETRY_DELAY_MILLISECONDS * 2 ** attempt, MAX_RETRY_DELAY_MILLISECONDS);
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1_000));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVehiclesResponse(value: unknown): value is VehiclesResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.vehicles) &&
    value.vehicles.every(
      (vehicle) =>
        isRecord(vehicle) &&
        typeof vehicle.id === 'string' &&
        typeof vehicle.displayName === 'string' &&
        typeof vehicle.make === 'string' &&
        typeof vehicle.model === 'string' &&
        (vehicle.year === undefined || typeof vehicle.year === 'number') &&
        typeof vehicle.color === 'string',
    )
  );
}

function isVehicleTelemetry(value: unknown): value is VehicleTelemetry {
  if (
    !isRecord(value) ||
    typeof value.vehicleId !== 'string' ||
    !isRecord(value.capabilities) ||
    typeof value.capabilities.windows !== 'boolean'
  ) {
    return false;
  }

  if (!value.capabilities.windows) {
    return value.signals === undefined;
  }

  if (!isRecord(value.signals) || !isRecord(value.signals.windows)) {
    return false;
  }

  const windows = value.signals.windows;
  const windowsValue = windows.value;
  return (
    isRecord(windowsValue) &&
    ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'].every((position) =>
      ['open', 'closed', 'unknown'].includes(String(windowsValue[position])),
    ) &&
    typeof windows.allClosed === 'boolean' &&
    typeof windows.oemUpdatedAt === 'string' &&
    typeof windows.retrievedAt === 'string'
  );
}

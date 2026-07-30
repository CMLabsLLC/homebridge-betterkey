import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TelemetryClient, type Fetcher } from '../../src/telemetry-client';

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

function jsonResponse(name: string, init: ResponseInit = {}): Response {
  return new Response(fixture(name), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('TelemetryClient', () => {
  it('loads the copied vehicles contract and sends bearer authentication', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(jsonResponse('vehicles_list.json'));
    const client = new TelemetryClient('https://api.example', 'bk_secret', fetcher);

    const result = await client.getVehicles();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.vehicles).toHaveLength(2);
      expect(result.data.vehicles[0].displayName).toBe('Subaru Forester');
    }
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/v1/vehicles',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer bk_secret' }),
      }),
    );
  });

  it('loads supported and unsupported telemetry contract fixtures', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValueOnce(jsonResponse('telemetry_windows.json'))
      .mockResolvedValueOnce(jsonResponse('telemetry_windows_unsupported.json'));
    const client = new TelemetryClient('https://api.example', 'bk_secret', fetcher);

    const supported = await client.getVehicleTelemetry('vehicle/with space');
    const unsupported = await client.getVehicleTelemetry('vehicle-2');

    expect(supported).toMatchObject({
      ok: true,
      data: { capabilities: { windows: true }, signals: { windows: { allClosed: true } } },
    });
    expect(unsupported).toEqual({
      ok: true,
      data: { vehicleId: 'veh-forester-2023', capabilities: { windows: false } },
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://api.example/v1/vehicles/vehicle%2Fwith%20space/telemetry',
      expect.any(Object),
    );
  });

  it('returns a clear unauthorized result without retrying', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(new Response('', { status: 401 }));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const client = new TelemetryClient('https://api.example', 'bk_bad', fetcher, sleep);

    await expect(client.getVehicles()).resolves.toEqual({
      ok: false,
      kind: 'unauthorized',
      status: 401,
      message: 'API key invalid or revoked',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('respects Retry-After on 429 before retrying', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '2' } }))
      .mockResolvedValueOnce(jsonResponse('vehicles_list.json'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const client = new TelemetryClient('https://api.example', 'bk_secret', fetcher, sleep);

    await expect(client.getVehicles()).resolves.toMatchObject({ ok: true });
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('uses exponential backoff for 5xx responses', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse('vehicles_list.json'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const client = new TelemetryClient('https://api.example', 'bk_secret', fetcher, sleep);

    await expect(client.getVehicles()).resolves.toMatchObject({ ok: true });
    expect(sleep.mock.calls).toEqual([[500], [1_000]]);
  });

  it('rejects a response that drifts from the golden contract', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(new Response('{"vehicles":[{"id":"missing-fields"}]}'));
    const client = new TelemetryClient('https://api.example', 'bk_secret', fetcher);

    await expect(client.getVehicles()).resolves.toMatchObject({
      ok: false,
      kind: 'invalid_response',
    });
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BetterKeyApiClient, type Fetcher } from '../../src/api-client';

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

describe('BetterKeyApiClient.getVehicles', () => {
  it('loads the copied vehicles contract and sends bearer authentication', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(jsonResponse('vehicles_list.json'));
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher);

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

  it('rejects a response that drifts from the golden contract', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(new Response('{"vehicles":[{"id":"missing-fields"}]}'));
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher);

    await expect(client.getVehicles()).resolves.toMatchObject({
      ok: false,
      kind: 'invalid_response',
    });
  });
});

describe('BetterKeyApiClient.getParkedAtHomeEvents', () => {
  it('loads an empty events response', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(jsonResponse('homebridge_events_empty.json'));
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher);

    await expect(client.getParkedAtHomeEvents()).resolves.toEqual({
      ok: true,
      data: { events: [] },
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/v1/homebridge/events',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer bk_secret' }),
      }),
    );
  });

  it('loads a single event and preserves timestamps as strings', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(jsonResponse('homebridge_events_single.json'));
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher);

    const result = await client.getParkedAtHomeEvents();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.events).toHaveLength(1);
      expect(result.data.events[0]).toMatchObject({
        type: 'parked_at_home',
        vehicleId: 'veh-forester-2023',
      });
    }
  });

  it('rejects an events payload with an unknown type', async () => {
    const body = JSON.stringify({
      events: [
        {
          id: 'evt-1',
          type: 'departed_from_home',
          vehicleId: 'veh-1',
          occurredAt: '2026-08-13T14:22:03Z',
          expiresAt: '2026-08-14T14:22:03Z',
        },
      ],
    });
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(new Response(body));
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher);

    await expect(client.getParkedAtHomeEvents()).resolves.toMatchObject({
      ok: false,
      kind: 'invalid_response',
    });
  });

  it('rejects a payload that is not JSON', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(new Response('not json'));
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher);

    await expect(client.getParkedAtHomeEvents()).resolves.toMatchObject({
      ok: false,
      kind: 'invalid_response',
    });
  });
});

describe('BetterKeyApiClient error handling', () => {
  it('returns a clear unauthorized result without retrying', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValue(new Response('', { status: 401 }));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const client = new BetterKeyApiClient('https://api.example', 'bk_bad', fetcher, sleep);

    await expect(client.getParkedAtHomeEvents()).resolves.toEqual({
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
      .mockResolvedValueOnce(jsonResponse('homebridge_events_empty.json'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher, sleep);

    await expect(client.getParkedAtHomeEvents()).resolves.toMatchObject({ ok: true });
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('uses exponential backoff for 5xx responses', async () => {
    const fetcher = jest
      .fn<ReturnType<Fetcher>, Parameters<Fetcher>>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse('homebridge_events_empty.json'));
    const sleep = jest.fn().mockResolvedValue(undefined);
    const client = new BetterKeyApiClient('https://api.example', 'bk_secret', fetcher, sleep);

    await expect(client.getParkedAtHomeEvents()).resolves.toMatchObject({ ok: true });
    expect(sleep.mock.calls).toEqual([[500], [1_000]]);
  });
});

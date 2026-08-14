import { resolveConfig } from '../../src/config';
import {
  DEFAULT_POLL_INTERVAL_SECONDS,
  MAXIMUM_POLL_INTERVAL_SECONDS,
  MINIMUM_POLL_INTERVAL_SECONDS,
  PRODUCTION_BASE_URL,
  resolveApiBaseUrl,
} from '../../src/settings';

describe('resolveConfig', () => {
  it('uses safe defaults', () => {
    expect(
      resolveConfig({ name: 'BetterKey', platform: 'BetterKey', apiKey: 'bk_secret' }),
    ).toEqual({
      apiKey: 'bk_secret',
      pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
      verboseLogging: false,
    });
  });

  it('rejects a missing or malformed API key', () => {
    expect(resolveConfig({ name: 'BetterKey', platform: 'BetterKey', apiKey: '' })).toBeUndefined();
    expect(
      resolveConfig({ name: 'BetterKey', platform: 'BetterKey', apiKey: 'not-a-key' }),
    ).toBeUndefined();
  });

  it('clamps the poll interval to supported bounds', () => {
    expect(
      resolveConfig({
        name: 'BetterKey',
        platform: 'BetterKey',
        apiKey: 'bk_secret',
        pollIntervalSeconds: 1,
        verboseLogging: true,
      }),
    ).toMatchObject({
      pollIntervalSeconds: MINIMUM_POLL_INTERVAL_SECONDS,
      verboseLogging: true,
    });

    expect(
      resolveConfig({
        name: 'BetterKey',
        platform: 'BetterKey',
        apiKey: 'bk_secret',
        pollIntervalSeconds: 9_999,
      }),
    ).toMatchObject({
      pollIntervalSeconds: MAXIMUM_POLL_INTERVAL_SECONDS,
    });
  });
});

describe('resolveApiBaseUrl', () => {
  it('defaults to the production origin', () => {
    expect(resolveApiBaseUrl({})).toBe(PRODUCTION_BASE_URL);
  });

  it('accepts an internal HTTPS-origin override without preserving a trailing slash', () => {
    expect(resolveApiBaseUrl({ BETTERKEY_API_BASE_URL: 'https://internal.example/' })).toBe(
      'https://internal.example',
    );
  });

  it.each([
    'http://internal.example',
    'https://user:secret@internal.example',
    'https://internal.example/path',
    'https://internal.example?query=yes',
    'not-a-url',
  ])('rejects an unsafe override: %s', (value) => {
    expect(() => resolveApiBaseUrl({ BETTERKEY_API_BASE_URL: value })).toThrow();
  });
});

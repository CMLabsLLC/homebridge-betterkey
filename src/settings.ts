export const PLUGIN_NAME = 'homebridge-betterkey';
export const PLATFORM_NAME = 'BetterKey';
export const PRODUCTION_BASE_URL = 'https://betterkey.xyz';

export const DEFAULT_POLL_INTERVAL_SECONDS = 60;
export const MINIMUM_POLL_INTERVAL_SECONDS = 30;
export const MAXIMUM_POLL_INTERVAL_SECONDS = 600;

export function resolveApiBaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const override = environment.BETTERKEY_API_BASE_URL?.trim();
  if (!override) {
    return PRODUCTION_BASE_URL;
  }

  const url = new URL(override);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('BETTERKEY_API_BASE_URL must be an HTTPS origin');
  }
  return url.origin;
}

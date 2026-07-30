export const PLUGIN_NAME = 'homebridge-betterkey';
export const PLATFORM_NAME = 'BetterKey';
export const PRODUCTION_BASE_URL = 'https://betterkey.xyz';

export const DEFAULT_POLL_INTERVAL_MINUTES = 15;
export const DEFAULT_STALENESS_THRESHOLD_MINUTES = 6 * 60;

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

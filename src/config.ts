import type { PlatformConfig } from 'homebridge';

import {
  DEFAULT_POLL_INTERVAL_SECONDS,
  MAXIMUM_POLL_INTERVAL_SECONDS,
  MINIMUM_POLL_INTERVAL_SECONDS,
} from './settings';

export interface BetterKeyPlatformConfig extends PlatformConfig {
  name: string;
  apiKey: string;
  pollIntervalSeconds?: number;
  verboseLogging?: boolean;
}

export interface ResolvedConfig {
  apiKey: string;
  pollIntervalSeconds: number;
  verboseLogging: boolean;
}

export function resolveConfig(config: BetterKeyPlatformConfig): ResolvedConfig | undefined {
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (!apiKey.startsWith('bk_')) {
    return undefined;
  }

  return {
    apiKey,
    pollIntervalSeconds: boundedInteger(
      config.pollIntervalSeconds,
      DEFAULT_POLL_INTERVAL_SECONDS,
      MINIMUM_POLL_INTERVAL_SECONDS,
      MAXIMUM_POLL_INTERVAL_SECONDS,
    ),
    verboseLogging: config.verboseLogging === true,
  };
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value === undefined) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

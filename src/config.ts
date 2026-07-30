import type { PlatformConfig } from 'homebridge';

import { DEFAULT_POLL_INTERVAL_MINUTES, DEFAULT_STALENESS_THRESHOLD_MINUTES } from './settings';

export interface BetterKeyPlatformConfig extends PlatformConfig {
  name: string;
  apiKey: string;
  pollIntervalMinutes?: number;
  stalenessThresholdMinutes?: number;
  verboseLogging?: boolean;
}

export interface ResolvedConfig {
  apiKey: string;
  pollIntervalMinutes: number;
  stalenessThresholdMinutes: number;
  verboseLogging: boolean;
}

export function resolveConfig(config: BetterKeyPlatformConfig): ResolvedConfig | undefined {
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  if (!apiKey.startsWith('bk_')) {
    return undefined;
  }

  return {
    apiKey,
    pollIntervalMinutes: boundedInteger(
      config.pollIntervalMinutes,
      DEFAULT_POLL_INTERVAL_MINUTES,
      5,
      60,
    ),
    stalenessThresholdMinutes: boundedInteger(
      config.stalenessThresholdMinutes,
      DEFAULT_STALENESS_THRESHOLD_MINUTES,
      15,
      10_080,
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

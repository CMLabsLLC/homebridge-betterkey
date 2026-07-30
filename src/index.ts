import type { API } from 'homebridge';

import { BetterKeyPlatform } from './platform';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';

export = (api: API): void => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, BetterKeyPlatform);
};

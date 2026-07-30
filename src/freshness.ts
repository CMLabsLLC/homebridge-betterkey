export const CONTACT_DETECTED = 0 as const;
export const CONTACT_NOT_DETECTED = 1 as const;
export const NO_FAULT = 0 as const;
export const GENERAL_FAULT = 1 as const;

export interface RenderedFreshness {
  hkValue: typeof CONTACT_DETECTED | typeof CONTACT_NOT_DETECTED | null;
  statusFault: typeof NO_FAULT | typeof GENERAL_FAULT;
  ageMinutes: number | null;
}

/**
 * Converts raw window telemetry into a truthful HomeKit state.
 *
 * A closed vehicle is a detected/closed contact (0); any open window is an
 * undetected/open contact (1). Once the OEM timestamp is older than the threshold,
 * the contact value becomes unknown and StatusFault tells HomeKit not to trust it.
 */
export function renderState(
  allClosed: boolean | undefined,
  oemUpdatedAt: string | undefined,
  now: Date,
  thresholdMinutes: number,
): RenderedFreshness {
  if (typeof allClosed !== 'boolean' || !oemUpdatedAt) {
    return { hkValue: null, statusFault: GENERAL_FAULT, ageMinutes: null };
  }

  const updatedAt = new Date(oemUpdatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    return { hkValue: null, statusFault: GENERAL_FAULT, ageMinutes: null };
  }

  const ageMinutes = Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / 60_000));
  if (ageMinutes > thresholdMinutes) {
    return { hkValue: null, statusFault: GENERAL_FAULT, ageMinutes };
  }

  return {
    hkValue: allClosed ? CONTACT_DETECTED : CONTACT_NOT_DETECTED,
    statusFault: NO_FAULT,
    ageMinutes,
  };
}

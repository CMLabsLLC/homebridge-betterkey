import {
  CONTACT_DETECTED,
  CONTACT_NOT_DETECTED,
  GENERAL_FAULT,
  NO_FAULT,
  renderState,
} from '../../src/freshness';

const now = new Date('2026-07-26T20:00:00Z');

describe('renderState', () => {
  it('renders fresh closed windows as a detected contact', () => {
    expect(renderState(true, '2026-07-26T19:55:00Z', now, 360)).toEqual({
      hkValue: CONTACT_DETECTED,
      statusFault: NO_FAULT,
      ageMinutes: 5,
    });
  });

  it('renders any fresh open window as an undetected contact', () => {
    expect(renderState(false, '2026-07-26T19:30:00Z', now, 360)).toEqual({
      hkValue: CONTACT_NOT_DETECTED,
      statusFault: NO_FAULT,
      ageMinutes: 30,
    });
  });

  it('treats the exact threshold as fresh', () => {
    expect(renderState(true, '2026-07-26T14:00:00Z', now, 360)).toEqual({
      hkValue: CONTACT_DETECTED,
      statusFault: NO_FAULT,
      ageMinutes: 360,
    });
  });

  it('renders one minute past the threshold as unknown', () => {
    expect(renderState(true, '2026-07-26T13:59:00Z', now, 360)).toEqual({
      hkValue: null,
      statusFault: GENERAL_FAULT,
      ageMinutes: 361,
    });
  });

  it('keeps an honest age for far-stale data', () => {
    expect(renderState(false, '2026-07-20T20:00:00Z', now, 360)).toEqual({
      hkValue: null,
      statusFault: GENERAL_FAULT,
      ageMinutes: 8_640,
    });
  });

  it.each([undefined, '', 'not-a-timestamp'])(
    'faults when the OEM timestamp is missing or invalid: %s',
    (timestamp) => {
      expect(renderState(true, timestamp, now, 360)).toEqual({
        hkValue: null,
        statusFault: GENERAL_FAULT,
        ageMinutes: null,
      });
    },
  );

  it('faults when the signal value is missing', () => {
    expect(renderState(undefined, '2026-07-26T19:55:00Z', now, 360)).toEqual({
      hkValue: null,
      statusFault: GENERAL_FAULT,
      ageMinutes: null,
    });
  });

  it('clamps a future OEM timestamp to zero age', () => {
    expect(renderState(true, '2026-07-26T20:05:00Z', now, 360)).toEqual({
      hkValue: CONTACT_DETECTED,
      statusFault: NO_FAULT,
      ageMinutes: 0,
    });
  });
});

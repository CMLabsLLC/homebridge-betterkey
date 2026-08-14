# Changelog

## 0.2.0

- Replace the aggregate Windows contact sensor with a **Parked at Home** motion
  sensor per vehicle. The plugin now consumes the privacy-preserving
  `/v1/homebridge/events` surface instead of OEM window telemetry.
- Poll for new events on a 60-second default cadence (config-tunable, 30–600 s).
- Persist processed event ids per accessory so a Homebridge restart cannot replay
  a HomeKit automation.
- Drop the Windows telemetry client, freshness rendering, Last Reported companion
  service, and `stalenessThresholdMinutes` configuration.

## 0.1.0

- Add a dynamic BetterKey platform with one accessory per vehicle.
- Add aggregate window contact sensors with explicit stale-data faults.
- Add a Last Reported companion service.
- Add resilient telemetry polling with rate-limit and server-error backoff.

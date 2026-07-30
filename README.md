# Homebridge BetterKey

Expose honest, read-only BetterKey vehicle telemetry to HomeKit through
Homebridge.

Version 0.1 provides one aggregate **Windows** contact sensor per vehicle. It
never unlocks, starts, locates, or otherwise controls a vehicle.

> [!IMPORTANT]
> Vehicle data is not real-time. BetterKey reports the timestamp supplied by the
> vehicle manufacturer, which may lag by minutes or hours. When that timestamp
> exceeds your configured freshness threshold, the sensor raises a HomeKit
> fault instead of presenting stale data as current.

## Requirements

- Homebridge 1.6 or newer
- Node.js 20 or newer
- An active BetterKey subscription
- A BetterKey API key

## Installation

When the package is available on npm:

```bash
npm install -g homebridge-betterkey
```

You can also install it from the Homebridge UI by searching for **BetterKey**.

## Create an API key

In the BetterKey app, open **Settings → Homebridge & API access**, generate a
key, and copy it immediately. The full `bk_…` secret is shown only once.

Treat the API key like a password. Homebridge stores it in its local
configuration. If it is exposed, revoke it in BetterKey and generate a
replacement.

## Configuration

The Homebridge UI presents the supported settings. A manual platform entry
looks like this:

```json
{
  "platform": "BetterKey",
  "name": "BetterKey",
  "apiKey": "bk_REPLACE_WITH_YOUR_KEY",
  "pollIntervalMinutes": 15,
  "stalenessThresholdMinutes": 360,
  "verboseLogging": false
}
```

| Setting                     |  Default | Description                                                          |
| --------------------------- | -------: | -------------------------------------------------------------------- |
| `apiKey`                    | required | API key generated in BetterKey Settings.                             |
| `pollIntervalMinutes`       |     `15` | How often to request telemetry. Allowed range: 5–60 minutes.         |
| `stalenessThresholdMinutes` |    `360` | Maximum acceptable OEM data age. Allowed range: 15–10,080 minutes.   |
| `verboseLogging`            |  `false` | Logs timestamps, age, and rendered state. API keys are never logged. |

The service endpoint is selected by BetterKey and is not configurable.

## What appears in HomeKit

Each BetterKey vehicle becomes one Homebridge accessory with:

- **Windows** — an aggregate contact sensor. Closed means every reported window
  is closed; open means at least one reported window is open.
- **Last Reported** — a companion battery-style service representing the age of
  the OEM update in minutes. HomeKit limits this characteristic to 0–100, so
  `100` means 100 minutes or older.

Fresh telemetry updates both services. At an age greater than
`stalenessThresholdMinutes`, the Windows service raises `StatusFault`; its last
contact value must not be treated as current while that fault is present.

## Compatibility

Window telemetry depends on vehicle, region, connected-services enrollment, and
manufacturer support. A vehicle can appear in BetterKey while its window signal
is unavailable.

| Vehicle              | Region        | Observed behavior                                                                                                                                  |
| -------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2023 Subaru Forester | United States | Window telemetry observed after Subaru STARLINK reports a new vehicle state, commonly following ignition activity. It is not a live window sensor. |

Please submit additional observations with the
[OEM compatibility template](https://github.com/CMLabsLLC/homebridge-betterkey/issues/new?template=oem-compatibility.yml).

## Troubleshooting

### API key invalid or revoked

Generate a replacement in BetterKey Settings and update the Homebridge
configuration. Also confirm the BetterKey subscription is active.

### Sensor shows a fault

The most recent manufacturer timestamp is too old, the signal is unavailable,
or BetterKey could not retrieve telemetry. This is intentional: automations
should not interpret stale data as a current closed-window state.

### A vehicle is missing

Restart Homebridge after confirming the vehicle appears in BetterKey. The
dynamic platform reconciles added and removed vehicles during startup.

For diagnostic timestamps, temporarily enable `verboseLogging`. Remove API keys
and other account details before attaching logs to a public issue.

## Limitations

- Windows only; no per-window sensors in v0.1.
- Read-only; no vehicle commands.
- No vehicle location.
- Cloud polling, not push or real-time telemetry.
- The Last Reported companion value is capped at 100 minutes by HomeKit.
- This initial release is not yet a Homebridge Verified plugin.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing the telemetry contract or
submitting compatibility data.

## Privacy and security

The plugin sends the configured API key only to the BetterKey service and
requests read-only vehicle identity and window telemetry. It does not request
location or command access. Revoke a key at any time from BetterKey Settings.

## License

[MIT](LICENSE) © CMLabs LLC

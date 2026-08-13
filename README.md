# Homebridge BetterKey

Bridge BetterKey's privacy-preserving **Parked at Home** confirmations into HomeKit
through Homebridge.

Each BetterKey vehicle appears as a HomeKit **motion sensor** named _{Vehicle} Parked
at Home_. Whenever BetterKey confirms that the vehicle parked inside your device-local
Home geofence, the sensor pulses active for 30 seconds so an Apple Home automation can
run. It is not a continuous presence sensor, and it never reports an away-from-home
state.

> [!IMPORTANT]
> BetterKey compares the confirmed park to your Home geofence entirely on your iPhone.
> Your Home coordinate, the confirmed park coordinate, and the geofence radius never
> leave the device. Only a short-lived `parked_at_home` event (id, vehicle, timestamp)
> is sent to the BetterKey service for this plugin to poll. Confirmed events are
> retained for 24 hours and then deleted.

## Requirements

- Homebridge 1.6 or newer
- Node.js 20 or newer
- An active BetterKey subscription
- A BetterKey API key
- iOS BetterKey with a configured Home geofence (Settings → Homebridge & API access)

## Installation

When the package is available on npm:

```bash
npm install -g homebridge-betterkey
```

You can also install it from the Homebridge UI by searching for **BetterKey**.

## Create an API key and set your Home

In the BetterKey app, open **Settings → Homebridge & API access**:

1. Generate an API key and copy the full `bk_…` secret. It is shown only once.
2. Tap **Use Current Location as Home** and confirm the radius (default 150 m).

Treat the API key like a password. Homebridge stores it in its local configuration.
If it is exposed, revoke it in BetterKey and generate a replacement.

## Configuration

The Homebridge UI presents the supported settings. A manual platform entry looks like
this:

```json
{
  "platform": "BetterKey",
  "name": "BetterKey",
  "apiKey": "bk_REPLACE_WITH_YOUR_KEY",
  "pollIntervalSeconds": 60,
  "verboseLogging": false
}
```

| Setting               |  Default | Description                                                      |
| --------------------- | -------: | ---------------------------------------------------------------- |
| `apiKey`              | required | API key generated in BetterKey Settings.                         |
| `pollIntervalSeconds` |     `60` | How often to check for new events. Allowed range: 30–600 s.      |
| `verboseLogging`      |  `false` | Logs event ids and dispatch outcomes. API keys are never logged. |

The service endpoint is selected by BetterKey and is not configurable.

## What appears in HomeKit

Each BetterKey vehicle becomes one Homebridge accessory with a single service:

- **{Vehicle} Parked at Home** — a motion sensor. It pulses active (motion detected)
  for 30 seconds when BetterKey confirms a new Home park for that vehicle, then
  returns to inactive.

Use it as an Apple Home automation trigger: for example, _When Forester Parked at
Home detects motion after sunset, turn on the driveway lights._

## What this plugin does not do

- It never reports an away-from-home or "not parked" state.
- It never receives your Home coordinate, the confirmed park coordinate, the radius,
  or the vehicle's location.
- It cannot lock, unlock, start, stop, or otherwise command a vehicle.
- It does not track vehicle presence outside a confirmed park at Home.
- It does not receive push notifications; it polls the API on the configured interval.

## Missed opportunities are possible

BetterKey confirms parks by observing successful park detections on your iPhone. If
the OS suspends the app, denies location, or throttles background work, a specific
park at Home may be missed and the event may never fire. Design HomeKit automations
so a missed pulse is inconvenient rather than unsafe.

If you notice a pattern of missed events, check that BetterKey has **Always** location
access on iOS and that background app refresh is enabled.

## Troubleshooting

### API key invalid or revoked

Generate a replacement in BetterKey Settings and update the Homebridge configuration.
Also confirm your BetterKey subscription is active.

### The motion sensor never triggers

Confirm all of the following:

1. Your BetterKey subscription is active and the API key has not been revoked.
2. You configured a Home geofence in the BetterKey app.
3. The vehicle is currently reporting successful park confirmations in the BetterKey
   app's Park Location screen.
4. When you last drove home, BetterKey's "parked" confirmation actually landed on
   your iPhone.
5. `pollIntervalSeconds` is at or near its default. A very long interval delays event
   pickup by up to that many seconds.

Confirmed events persist server-side for 24 hours, so a Homebridge restart within
that window will still find any unprocessed events.

### A vehicle is missing

Restart Homebridge after confirming the vehicle appears in BetterKey. The dynamic
platform reconciles added and removed vehicles during startup.

For diagnostic timestamps, temporarily enable `verboseLogging`. Remove API keys and
other account details before attaching logs to a public issue.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing the event contract or filing
compatibility observations.

## Privacy and security

- The plugin sends the configured API key only to the BetterKey service.
- The BetterKey service exposes only the id, vehicle, and timestamps of a confirmed
  Parked at Home event to an API-key holder. No coordinate is ever sent over this
  channel.
- Events expire and become unreadable 24 hours after they occur.
- Revoke an API key at any time from BetterKey Settings.

## License

[MIT](LICENSE) © CMLabs LLC

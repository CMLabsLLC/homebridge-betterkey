# Contributing

Thanks for helping improve Homebridge BetterKey. Bug fixes, documentation
improvements, and vehicle compatibility observations are welcome.

## Development setup

```bash
npm ci
npm run build
npm link
```

Add the plugin to a non-production Homebridge instance, then run Homebridge in
debug mode. Never commit an API key, paste one into an issue, or include one in
logs.

Before opening a pull request:

```bash
npm run format:check
npm run lint
npm test
npm run build
```

## OEM compatibility observations

Use the OEM compatibility issue template. Include:

- model year, make, and model;
- country or region;
- whether window telemetry is available;
- what activity preceded an updated OEM timestamp;
- approximate reporting delay;
- Homebridge and plugin versions.

Do not include VINs, vehicle IDs, API keys, precise location, account details,
or unredacted logs.

Compatibility reports should describe observed behavior, not promise universal
support across a make or model year.

## Telemetry contract changes

The API contract is owned by the private BetterKey API repository. Propose
contract changes by opening an issue here; do not independently alter the copied
fixtures or public TypeScript types.

Once an upstream contract change is approved and released:

1. update the golden fixture in the BetterKey API repository;
2. hand-copy that fixture into `test/fixtures/`;
3. update `src/types/` and client validation;
4. add compatibility tests in this repository.

This two-repository process is intentional until the integration supports a
second sensor and justifies shared schema tooling.

## Releases

Releases use npm Trusted Publishing from the GitHub-hosted `release.yml`
workflow. Do not add a long-lived npm publish token to the repository.

The tag must exactly match the version in `package.json` (`v0.1.0` for version
`0.1.0`). The workflow validates formatting, lint, tests, and the build before
requesting a short-lived OIDC publishing credential from npm.

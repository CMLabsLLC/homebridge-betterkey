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

## Bug reports and observations

When reporting a missed or spurious **Parked at Home** event, include:

- Homebridge and plugin versions;
- the vehicle make, model, and model year;
- the configured `pollIntervalSeconds`;
- what the BetterKey app's Park Location screen showed at the same time;
- whether the pulse fired in Homebridge (motion-sensor state and the log lines
  around it) even if HomeKit did not react.

Do not include VINs, vehicle IDs, API keys, precise location, account details,
or unredacted logs.

## API contract changes

The event API is owned by the private BetterKey API repository. Propose contract
changes by opening an issue here; do not independently alter the copied fixtures
or public TypeScript types.

Once an upstream contract change is approved and released:

1. update the golden payload in the BetterKey API repository;
2. hand-copy that payload into `test/fixtures/`;
3. update `src/types/` and client validation;
4. add compatibility tests in this repository.

This two-repository process is intentional until the integration supports more
than one event type and justifies shared schema tooling.

## Releases

Releases use npm Trusted Publishing from the GitHub-hosted `release.yml`
workflow. Do not add a long-lived npm publish token to the repository.

The tag must exactly match the version in `package.json` (`v0.2.0` for version
`0.2.0`). The workflow validates formatting, lint, tests, and the build before
requesting a short-lived OIDC publishing credential from npm.

Maintainers can also run `release.yml` manually with the `beta` channel. The
workflow derives an immutable prerelease version such as `0.2.0-beta.12` from
the package's stable version and the GitHub run number, then publishes it under
the npm `beta` dist-tag. It does not commit the generated prerelease version.

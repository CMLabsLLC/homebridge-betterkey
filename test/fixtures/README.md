# BetterKey telemetry contract fixtures

These files are hand-copied from
`CMLabsLLC/betterkey/internal/api/telemetry/contract/testdata/`, the source of
truth for the read-only telemetry API.

Contract changes are a deliberate two-repository operation:

1. update and test the fixture in the BetterKey API repository;
2. copy the changed fixture here;
3. update the hand-written types and tests in this repository.

Do not independently change these JSON files to make a plugin test pass.

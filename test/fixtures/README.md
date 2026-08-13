# BetterKey API contract fixtures

These files are hand-copied from
`CMLabsLLC/betterkey/internal/api/`, the source of truth for the
API-key-authenticated read surface consumed by this plugin.

Contract changes are a deliberate two-repository operation:

1. update and test the payload in the BetterKey API repository;
2. copy the changed payload here;
3. update the hand-written types and tests in this repository.

Do not independently change these JSON files to make a plugin test pass.

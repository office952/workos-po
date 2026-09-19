# WorkOS PO provenance

This repository is the canonical WorkOS product repository.

```text
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
```

## Historical sources

These SHAs remain provenance. They are not continuing development pins after authority handoff.

```text
HISTORICAL_PRESENTATION_SOURCE = office952/workos-ui20
HISTORICAL_PRESENTATION_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366

HISTORICAL_ENGINE_SOURCE = office952/workos-final
HISTORICAL_ENGINE_HEAD = 084ddebb02950d058554eec01f3dc347790f4ca1
```

## Seed law

- UI20 at `9446b6d` is the presentation baseline of WorkOS PO.
- The seed copies that exact frontend tree. Later UI20 commits were not included.
- Pass A reconstruction is not the frontend source.

## Engine consolidation

`apps/api` and `packages/domain` were imported exactly from WorkOS Final `084ddebb`.

```text
APPS_WEB_IMPORTED = NO
API_CONTRACT_ID = workos-ui-contract-v1
HEALTH_SERVICE_NAME = workos-final-api
NEW_SOURCE_OF_TRUTH_CREATED = NO
WORKOS_FINAL_CONTINUING_AUTHORITY = NO
WORKOS_UI20_CONTINUING_AUTHORITY = NO
```

The imported packages keep their internal names `@workos-final/api` and `@workos-final/domain`. Those names are package identity, not a second live repository authority.

## Data

Copying the engine did not copy or migrate real customer or business data. Real data remains in the external persistent WorkOS data root / Operational Planes. `WORKOS_CLOUD_ROOT` is not in Git and is not cut over by this consolidation.

## Tooling advisory

```text
ENGINE_LINT_COVERAGE = REQUIRED_BEFORE_OR_WITH_FIRST_WORKOS_PO_ENGINE_MODIFICATION
```

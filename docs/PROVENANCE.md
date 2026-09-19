# WorkOS PO provenance

This repository is the WorkOS PO product repository.

```text
TARGET_REPOSITORY = office952/workos-po

PRESENTATION_BASE_REPOSITORY = office952/workos-ui20
PRESENTATION_BASE_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366

BUSINESS_ENGINE_SOURCE = office952/workos-final
BUSINESS_ENGINE_HEAD = 084ddebb02950d058554eec01f3dc347790f4ca1
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
```

WorkOS Final remains the pinned business-engine source for this wave. The imported packages keep their internal names `@workos-final/api` and `@workos-final/domain`.

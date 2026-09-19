# WorkOS PO provenance

This repository is the WorkOS PO frontend baseline.

```text
TARGET_REPOSITORY = office952/workos-po

PRESENTATION_BASE_REPOSITORY = office952/workos-ui20
PRESENTATION_BASE_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366

BUSINESS_AUTHORITY_REPOSITORY = office952/workos-final
BUSINESS_AUTHORITY_HEAD_AT_SEED = 084ddebb02950d058554eec01f3dc347790f4ca1
```

## Seed law

- UI20 at `9446b6d` is the presentation baseline of WorkOS PO.
- The seed copies that exact tree. Later UI20 commits, including newer `origin/main`, were not included.
- WorkOS Final remains business, API, domain, and database authority during this wave.
- The frontend continues to use `/api` → `127.0.0.1:8787` and `workos-ui-contract-v1`.
- Pass A reconstruction in `workos-final` / `workos-final-single-frontend-convergence` is not the frontend source.

```text
PASS_A_FRONTEND_SOURCE = REJECTED_FOR_NEW_DIRECTION
PASS_A_PRESERVED_AS_HISTORICAL_EVIDENCE = YES
NEW_SOURCE_OF_TRUTH_CREATED = NO
```

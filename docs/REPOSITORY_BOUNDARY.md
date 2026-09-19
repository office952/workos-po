# Repository boundary

```text
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
ONE_PRODUCT_REPOSITORY = office952/workos-po
NO PARALLEL PRODUCT TRUTH
```

Historical repositories remain distinct provenance. They are not a second live product.

```text
workos-final != workos-po
workos-ui20 != workos-po
WORKOS_FINAL_CONTINUING_AUTHORITY = NO
WORKOS_UI20_CONTINUING_AUTHORITY = NO
```

## Model

```text
┌─────────────────────────────────┐
│ office952/workos-po             │
│                                 │
│ frontend                        │
│ adapters                        │
│ API                             │
│ domain                          │
│ persistence                     │
│ business engine                 │
└──────────────┬──────────────────┘
               │
               ▼
     external persistent data
     WORKOS_CLOUD_ROOT
```

`WORKOS_CLOUD_ROOT` is not cut over by engine consolidation. Isolated proof used temporary SQLite. Real Cloud write remains HOLD.

## Roles

| Repository | Role |
| --- | --- |
| `office952/workos-po` | Canonical product repository: preserved frontend, API, domain, persistence implementation, business engine |
| `office952/workos-ui20` | Historical presentation source at `9446b6d` |
| `office952/workos-final` | Historical business-engine source at `084ddebb` |

## Data authority

```text
SOURCE_CODE = workos-po
REAL_BUSINESS_DATA = external persistent WorkOS data root / Operational Planes
REAL_DATA_IN_GIT = NO
```

Copying the engine did not copy or migrate real customer or business data.

## Required isolation

- NO GIT SUBMODULE
- NO SYMLINK INTO `workos-final` OR `workos-ui20`
- NO CLIENT-SPECIFIC BUSINESS FORK
- NO SECOND PRODUCT TRUTH
- NO SECOND PRICING ENGINE
- NO SECOND EXECUTION ENGINE
- NO IMPORT OF Final `apps/web`
- NO SHARED REAL DATABASE FILE
- NO DEFAULT SYNC FROM `workos-final`

## Local directories

These must remain independent Git repositories:

```text
C:\Users\offic\workspace\workos-final
C:\Users\offic\workspace\workos-ui20
C:\Users\offic\workspace\workos-po
```

`workos-po` must not live inside `workos-final` or any `workos-final` worktree.

## Remotes

Required remote:

```text
origin = office952/workos-po
```

There must be no writable remote pointing to `office952/workos-final` or `office952/workos-ui20`.

Those repositories are historical/reference only.

## What this repository must never become

- a second WorkOS domain beside an active `workos-final` engine
- a customer-specific code fork
- a parallel calculator or Product Truth owner
- a Git store for real Cloud or operational databases

# Synthetic foundation consolidation V1

Consolidation of the synthetic data already on `main`. This is not a second fixture system, not a business-rule change, and not Owner acceptance.

```text
VERSION = SYNTHETIC_FOUNDATION_CONSOLIDATION_V1
SCENARIO = sfc.request.eight-commercial-branches.v1
BASE = origin/main at the commit recorded in the delivery report
```

## What is reused

| Need | Existing entry |
| --- | --- |
| Request without an offer, frozen offer, accepted job, unreleased job, released plan, execution states | `seedOwnerReviewDataset` and `prepareDemoAtelier` |
| ACM + letters assembly | `ensureAssemblyScenarioA` |
| Second quote on one request, same letters template | `ensureQuoteRevision` in the N-019 prepare path |
| Customer dossier, documents, history | `seedClientDossier` / `ALPHA_CLIMA_DOSSIER_SCENARIO` |
| Organization isolation, operator boundary | `apps/api/tests/cloud-isolation.test.ts` |
| Backup and restore guards | `createCloudBackup` / `restoreCloudBackup`; N-019 pairs a data backup with `*.demo-n019` and restores only into an absent or empty directory |

Seeds talk to canonical HTTP routes. They do not insert business rows with SQL.

## Scenario matrix

| Id | Coverage | Exists before this change | Entrypoint | Origin | Persisted | Repeatable | Idempotent | Browser-ready on its own root | On current main |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Request without an offer | Yes | `ensureRequest` | HTTP | Yes | Yes | Yes, by customer and title | Yes, when that root is running | Yes |
| B | Frozen offer awaiting a response | Yes | `freezeQuote` | HTTP | Yes | Yes | Yes, first quote on the request is kept | Yes | Yes |
| C | Accepted offer and created job | Yes | `acceptAndOrder`, `ensureAssemblyScenarioA` | HTTP | Yes | Yes | Yes, repeat acceptance is `409` | Yes | Yes |
| D | Job not released | Yes | Urban request in both seeds | HTTP | Yes | Yes | Yes | Yes | Yes |
| E | Job released and planned | Yes | `releaseAndPlan`, assembly execution plan | HTTP | Yes | Yes | Yes | Yes | Yes |
| F | Production in progress | Yes | Owner-review `applyExecutionStates`; N-019 cycle and history | HTTP | Yes | Yes | Ledger or existing task state | Yes on the N-019 root | Yes |
| G | Completed production | Yes | Same execution helpers and N-019 history H1 | HTTP | Yes | Yes | Yes | Yes on the N-019 root | Yes |
| H | ACM + letters assembly | Yes | `ensureAssemblyScenarioA` | HTTP | Yes | Yes | Yes, existing assembly job is reused | Yes | Yes |
| I | Several quotes on one request | Yes for two quotes | `ensureQuoteRevision` | HTTP | Yes | Yes | Ledger key `scenario:delta:quote-revision` | Yes on the N-019 root | Yes |
| J | Customer dossier with documents and history | Yes | `seedClientDossier` | HTTP | Yes | Yes | Ledger file in that root | Yes on the N-020 copy | Yes |
| K | Organization isolation | Yes | `provisionHostileIsolationWorld` | Test harness | Temp roots only | Yes | Each test builds its own world | No persistent browser pair | Yes |
| L | Operator sessions and resource eligibility | Yes | N-019 prepare, cycle, and `demo-atelier.test.ts` | HTTP | Yes | Yes | Pins are set once | Yes on the N-019 root | Yes |

`freezeQuote` stops when a request already has any quote. That helper is the wrong tool for several quotes on one request. The N-019 revision path and the scenario below do not use it for the extra quotes.

## Added scenario

`seedEightCommercialBranches` creates one customer and one request, then eight product quotes through preview, confirm, and quote-snapshot. Four use the letters template and four use the ACM template. Different inscriptions produce different `quoteSnapshotId` values. A second run finds each quote by product code and inscription and creates nothing.

A commercial branch in the request screen is one product quote snapshot, or one assembly. Eight product quotes are eight branches. They are not eight assembly members and not eight requests.

## Not added

A newer unaccepted quote on an assembly that already has a job is not persisted.

The screen can show an older assembly quote that still owns the job beside a newer unaccepted quote. The write path does not produce that state:

- After the order, member changes return `assembly_order_frozen`.
- The assembly quote id is `asmq:` plus the assembly truth id. Freezing again does not allocate a second snapshot.
- Accepting an older snapshot after a newer one already exists returns `assembly_quote_superseded`.

The test `refuses a newer assembly quote after the accepted order` records that refusal. The job stays on the original order snapshot. No frontend substitute was added.

There is no organization workflow mode for “advanced manufacturing” versus “manual commercial”. The supported difference is product enablement, plus which resources a seed creates. N-019 remains the advanced workshop on its own root. A temp-root test disables ACM on a second synthetic organization, leaves the first organization on the default catalog, and checks that a customer read or update does not cross organizations. No persistent two-organization browser root was added. `cloud-isolation.test.ts` already covers hostile cross-organization access.

## Roots that this change does not write

N-019 demo atelier, N-020 dossier copies, N-028 synthetic data, the N-030 isolated development root, the Owner reference runtime, real Cloud, and real customer data. Restore still refuses a target that is not absent or empty, and it refuses a backup whose migration set is not exactly the current schema.

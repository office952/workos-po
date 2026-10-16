# N-009 — Open decision: missing material and start eligibility

Status: **OPEN**. This note records a product decision that is not made. It does not change engine policy.

## Canon that stays

- `MATERIAL_READINESS` defaults to `DISABLED`.
- `materialParticipation("DISABLED", …)` stays `NOT_ADOPTED`.
- `materialBlocksStart` stays false in that mode.
- A job-material check of `MISSING` records the purchasing request and the existing `NOT_AVAILABLE` confirmation. It does not add a start block in the interface and it does not change the mode.

The operator sees a clear warning when the latest check is `MISSING`. Start remains whatever the execution engine returns for that operation.

## Decision still required

Whether a material confirmed missing must block the operations that use it inside the engine, including when Material Readiness is disabled.

The two unresolved options are:

1. Advisory warning only. This is the current engine behavior.
2. A server-owned blocking gate for the relevant operations, even while the module mode is `DISABLED`.

Option 2 needs an explicit Owner decision and a separate implementation. The purchasing-request foundation, the `requiresReview` signal, and this note do not choose it.

## Out of scope

No change to estimated-quantity formulas, stock, purchase orders, or supplier cancellation.

# N-009 — Missing material and start eligibility

Status: **DECIDED** (2026-10-16). Owner choice: advisory warning.

A material confirmed missing, including one that has a replenishment signal, does not add a new condition that blocks starting an operation. The operator can continue the steps WorkOS already allows, using the materials that are on hand.

## Canon that stays

- `MATERIAL_READINESS` defaults to `DISABLED`.
- `materialParticipation("DISABLED", …)` stays `NOT_ADOPTED`.
- `materialBlocksStart` stays false in that mode.
- A mode configured explicitly as `REQUIRED` keeps its existing engine behavior. This decision does not rewrite it.
- Existing dependency, skill, machine, and execution gates stay as the engine returns them.
- A job-material check of `MISSING` records the replenishment signal and the existing `NOT_AVAILABLE` confirmation. It does not add a start block in the interface.

The operator sees a warning when the latest check is `MISSING`. Start remains whatever the execution engine returns for that operation.

## Rejected for N-009

A new server-owned blocking gate for the relevant operations while the module mode is `DISABLED`.

## Purchase quantity

The technical estimate from the frozen plan stays visible. A new replenishment signal does not require, and does not invent, a purchase quantity. Unspecified is not zero. Purchasing decides a quantity later. That decision is separate from this start-gate choice.

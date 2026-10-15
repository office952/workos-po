# WorkOS Notion Journal Gate V1

Status: **OWNER-APPROVED GOVERNANCE RULE** (2026-10-14). Once [V2](NOTION_JOURNAL_GATE_V2.md) is present on protected `main`, V1 stays historical provenance and the fallback for any work without a valid V2 wave authorization; until then V1 alone is operative. This document binds planning and engineering work in `office952/workos-po`. It does **not** modify business runtime logic, Product Truth, prices, deployment eligibility, or customer availability.

## Durable authorities

- [Notion governance contract](https://app.notion.com/p/3f98ea98e40f81f0b3a3f5c6fca77025) — Owner-approved procedure.
- [Delivery Roadmap & Implementation History](https://app.notion.com/p/3f98ea98e40f8145862dc5a8a52301a4) — all past, current, future and blocked implementation entries.
- [Implementation registry](https://app.notion.com/p/cc42b70f86354dd7b08e6a00b4cb5156) — stable record IDs `H-###`, `N-###`, `R-###`, exact item URLs.
- [Change / integration journal](https://app.notion.com/p/cc9f25cbe6db48b8bf262832448f8390) — immutable-in-practice chronological entries.
- [Master Audit](https://app.notion.com/p/3f98ea98e40f81b68ce3dc677ef87427) — evidence, findings, Owner decisions and E2E acceptance.
- `AGENTS.md`, `docs/ROADMAP.md` and source code remain repository authorities for engineering and the implemented product. Notion does not become a second business engine.

## Non-negotiable pre-work gate

Before turning a discovery into an executable plan, changing product requirements, writing source/docs/tests/config, touching PR metadata, committing, pushing, merging, deploying, running a migration, or modifying real data:

1. Find the existing matching Notion implementation record or create a new one.
2. Verify that the record is **readable** in the designated implementation registry. Record its stable ID and exact page URL; a remembered ID is not proof.
3. Record the proposal and scope: objective, impacted modules, dependencies, linked audit findings, current baseline, expected evidence, permission boundaries and proposed acceptance criteria.
4. Confirm the Owner's specific GO for the requested **action**. A Notion record, roadmap priority or draft proposal does not authorize implementation/merge/deploy.
5. Resolve contradictions with existing Owner decisions and the repository canon **before** implementing. Record the decision and scope changes in Notion first.

```text
NOTION_RECORD_ID =
NOTION_RECORD_URL =
NOTION_RECORD_FOUND = YES/NO
NOTION_RECORD_VERIFIED = YES/NO
OWNER_GO_FOR_REQUESTED_ACTION = YES/NO
SOURCE_BASELINE =
SCOPE_MATCHES_NOTION = YES/NO
NOTION_GATE = PASS / STOP
```

If `NOTION_GATE != PASS`, **STOP BEFORE WRITE**. Do not silently reuse a different record or invent an Owner GO. If Notion cannot be reached, do not proceed with unlogged implementation or executable planning on the promise of recording it later.

A read-only investigation associated with an already recorded audit item can continue within that item's scope; any new executable work item must be recorded before it advances.

## Required lifecycle

`NOTION_REGISTERED → OWNER_SCOPE_GO → IMPLEMENTATION → TEST / CI / RUNTIME_EVIDENCE → PR_REVIEW → OWNER_MERGE_GO → INTEGRATED → OWNER_ACCEPTANCE (separate) → FOLLOW_UP`

At every substantive transition update the existing implementation record and append a change-journal event: what changed, by whom, when, why, exact Git SHA/PR, evidence, status and next step. Retain prior entries; supersede rather than delete.

**TRECUT**: merged historical work, without fictional Owner acceptance.

**ACUM**: active audits, authorized work and evidence gathering.

**URMEAZA**: candidate backlog, without implied implementation authorization.

**BLOCAT**: pending business decisions, environment or Owner GO.

## Cursor / agent contract

All substantive WorkOS prompts must name `NOTION_RECORD_ID`, `NOTION_RECORD_URL`, the Owner-approved scope and this policy. After proving the correct repository and isolated source identity, verify the Notion gate **before any write**. Parallel specialists remain read-only. If scope expands, STOP and log the change before requesting a new GO.

No project rule or tool prompt overrides these boundaries.

## Pull request contract

All PRs targeting `main` must include **exactly grounded** fields:

```text
Notion Record ID: N-006
Notion Record URL: https://app.notion.com/p/<record-page-id>
Owner GO: <what action was authorized, with reference>
Scope: <bounded change>
Evidence: <tests/CI/browser proof and limits>
```

The PR must point to the **implementation record**, not only the governance policy page. The reviewer must open that record, confirm the scope/GO, check the evidence, and log the final disposition and merge SHA in the change journal.

A CI guard may validate the presence/shape of the record metadata in a PR. **Metadata validation is not live Notion record verification.** Full automatic live verification needs a separately authorized, least-privilege Notion integration and explicit configuration of GitHub protection; do not claim that the present guard proves Notion record status.

## Real-system separation and failure mode

Notion is the **development governance journal**, not a runtime dependency for quotations, customers, operators, manufacturing, or production. Never call Notion from business execution simply to satisfy this gate.

Existing protections for `main`, security, permissions, snapshot integrity, synthetic/real data isolation and CI remain in force. Do not weaken them. Direct real-DB/Cloud mutation, migrations, deploy and first real business operations continue to require separate specific Owner authorization and operational readiness.

If Notion is unavailable, fail closed for governance mutations and log the outage once access is restored. Do not invent an emergency bypass; emergency exception design, if desired, requires a separate Owner policy.

## V1 implementation and acceptance

- Notion policy, roadmap item `N-006`, Owner decision `DR-010` and change-journal entry exist.
- This file + `AGENTS.md` pointer + PR template form the documented agent/PR contract.
- A GitHub PR-body check can require metadata format; it cannot attest live Notion access without separate credentials.
- The requirement only becomes enforceable on protected `main` after the change is merged and the existing required CI check is verified. Until then: **DOCUMENTED_CANDIDATE, not enforced in main**.

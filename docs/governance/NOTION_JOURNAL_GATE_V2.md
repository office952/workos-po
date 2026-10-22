# WorkOS Notion Journal Gate V2 — delegated wave authorization

Status: **CANDIDATE** under implementation record [N-007](https://app.notion.com/p/3f98ea98e40f814eb2d3cae41d6461a1), Owner implementation GO [EV-GOV-012](https://app.notion.com/p/3f98ea98e40f817c8d54e6c14a676c69) (2026-10-14).

V2 is **active only when this file exists on protected `origin/main`**. Its presence in an unmerged branch activates nothing. Until then [V1](NOTION_JOURNAL_GATE_V1.md) is the operative rule. After activation V1 remains historical provenance and the fallback for any work without a valid V2 authorization.

This document governs development only. It does not change business runtime, Product Truth, pricing, deployment eligibility or customer availability. WorkOS runtime never calls Notion.

## Operating model

```text
OWNER → approves a bounded wave (Notion decision record)
      → signs the wave authorization with the Owner key, lands it on protected main
CURSOR → verifies Git identity + the signed authorization offline, executes the whole wave
GITHUB → records code, CI and evidence
NOTION → keeps the chronological journal (synchronized live or reconciled later)
INDEPENDENT REVIEWER → reviews the PR
OWNER → separate merge decision, separate acceptance
```

| Layer | Owner of truth |
| --- | --- |
| Business direction, privileged decisions | Owner |
| Executable engineering contract | GitHub protected `main` |
| Chronological decision/implementation journal | Notion |
| Authorized implementation and verification | Cursor local |
| Implementation review | Independent reviewer |

## Distinct states — never conflate

| State | Proven by | Grants |
| --- | --- | --- |
| Authenticated Owner approval | Owner decision record in Notion, read through an authenticated channel | Intent only |
| Recorded scope | Implementation record in the Notion registry | Nothing executable |
| **Executable authorization** | Owner-signed manifest on protected `main`, verified by `scripts/verify-wave-authorization.mjs` | Only the listed delegable engineering actions, in scope, until expiry or revocation |
| Source implementation | Commits on the authorized branch | Nothing |
| Test evidence | Local runs and WorkOS Verify CI | Nothing |
| Independent review | Reviewer disposition on the PR | Nothing |
| Owner merge approval | Owner decision, merge executed by the Owner | Integration of that PR only |
| Owner acceptance | Separate Owner record | Acceptance only |
| Notion synchronization | Sync ledger state (below) | **Nothing** |

## Trust boundary

The implementation agent operates with the Owner's GitHub credentials, which are admin and the `Protect main process` bypass actor (see AUD-GOV-001). Therefore "merged on `main`" or "authored by office952" can **not** prove Owner approval. The trust anchor is a cryptographic Owner signature:

1. **Owner signing key.** An SSH key controlled only by the Owner — preferably a FIDO2 hardware key (`ed25519-sk`, touch required), otherwise a passphrase-protected key **never loaded into ssh-agent** and not stored where agents run unattended. Its public part is registered in `docs/governance/authorizations/owner_allowed_signers` by the Owner. The agent never creates, registers or uses an Owner key.
2. **Protected source.** The verifier reads the manifest, signature, signer set and V2 contract **only from the protected base ref** (`origin/main` locally, the PR base in CI). Nothing in the candidate branch can add authority.
3. **Protected verifier.** CI runs the verifier loaded from the base ref, so a candidate cannot weaken the check it is judged by. Locally, run the base copy as well (procedure below).
4. **No self-approval.** A wave candidate that touches `docs/governance/authorizations/**` is refused. Authorization PRs must contain only authorization files; each new manifest must verify against the **base** signer set. Signer-set changes never pass CI and require the Owner's own explicit action.
5. **Fail closed.** Any missing, unreadable, malformed, unsigned, altered, foreign-signed, expired, revoked, out-of-scope, wrong-repository or wrong-branch condition yields `GATE=STOP`.

## Wave authorization manifest

`docs/governance/authorizations/<RECORD_ID>.json` with detached signature `<RECORD_ID>.json.sig` (SSH signature, namespace `workos-wave-authorization`, LF line endings).

| Field | Meaning |
| --- | --- |
| `schema` | `workos.wave-authorization/v1` |
| `recordId`, `notionRecordUrl` | Stable implementation record ID and exact Notion URL |
| `ownerGo.recordId`, `ownerGo.url` | Owner decision record (e.g. `EV-GOV-012`) and URL — approval provenance |
| `revision`, `supersedes` | Approval revision; a superseding manifest must increase it |
| `objective` | Approved objective |
| `repository`, `branch` | Exact repository and the single authorized branch |
| `scope.paths` | Bounded path globs (no universal `*`/`**` prefix; never the authorization directory) |
| `authorizedActions` | Subset of `IMPLEMENT`, `TEST`, `COMMIT`, `PUSH`, `PR_CREATE` (covers updates of that PR), `NOTION_JOURNAL_WRITE` |
| `prohibitedActions` | Must explicitly list every non-delegable action |
| `approver.name`, `approver.github`, `approver.principal` | Owner identity; `principal` must be a registered signer |
| `approvedAt`, `validUntil` | Validity window, at most 30 days |
| `evidence` | Linked evidence and its verification status |
| `resolvesConflicts` (optional) | `[{seq, sha256}]` — the exact `SCOPE_CONFLICT` ledger lines this revision clears (SHA-256 of the LF-normalized line). Only valid with `revision ≥ 2` superseding an authorization already on protected `main` |

**Non-delegable actions** — never valid in a manifest and always `STOP` in the verifier: `MERGE`, `DEPLOY`, `REAL_CLOUD_ACCESS`, `REAL_CLOUD_WRITE`, `REAL_DB_WRITE`, `DB_MIGRATION`, `GITHUB_RULESET_MUTATION`, `PERMISSION_EXPANSION`. These keep requiring a separate, live, specific Owner decision exactly as in V1.

**Revocation.** `docs/governance/authorizations/revocations.json` (`workos.wave-revocations/v1`) lists `{recordId, revision | "ALL", at, reason}`. Revocations are honoured from the base **and** the candidate (revoking only removes authority) and are append-only. **Supersession** is a new Owner-signed revision; Git history keeps every prior revision. An authorization is never deleted through the PR path — deletion followed by re-adding an older, still-valid signed revision would bypass the revision increase — so authority is withdrawn by appending a revocation.

## Execution procedure (Cursor)

```text
1. Git identity gate (repository, workspace, branch, HEAD, origin/main, clean state).
2. git fetch origin main
3. git show origin/main:scripts/verify-wave-authorization.mjs > <temp>/verify-wave-authorization.mjs
4. node <temp>/verify-wave-authorization.mjs check --record <ID> --action <ACTION>
```

`GOVERNANCE_GATE=PASS` together with `WAVE_AUTHORIZATION=VALID` means the in-scope action of that wave may proceed **without a live Notion login**. Re-run before each commit/push/PR step; it is offline and fast. Any `STOP`, a needed path outside `scope.paths`, or any non-delegable action means **STOP** and return to the Owner — record the conflict as `SCOPE_CONFLICT`.

Without a valid V2 authorization the V1 procedure applies unchanged (live Notion verification before any write).

## Notion synchronization

Each wave may keep an append-only ledger `docs/governance/journal/<RECORD_ID>.sync.jsonl` (the only file outside `scope.paths` a wave may change). One JSON object per line:

```json
{"seq":1,"at":"2026-10-20T09:00:00Z","event":"commit 1a2b3c pushed","sha":"1a2b3c…","state":"SYNC_PENDING"}
{"seq":2,"at":"2026-10-20T11:00:00Z","event":"journal entry created","state":"SYNC_CONFIRMED","notionUrl":"https://app.notion.com/p/<32-hex>","reconciles":1}
```

| State | Meaning | Effect |
| --- | --- | --- |
| `SYNC_CONFIRMED` | Event exists in the Notion journal (`notionUrl` required) | Informational |
| `SYNC_PENDING` | Not yet journaled (e.g. Notion unavailable) | In-scope work of a valid wave may continue; must be reconciled |
| `SYNC_FAILED` | A journal write failed | Reported; must be reconciled |
| `SCOPE_CONFLICT` | Needed work exceeds the approval | **STOP** until a newer Owner-signed revision clears it (below) |

**Conflict clearance comes only from the Owner signature.** A `SCOPE_CONFLICT` line stays blocking until the manifest in force on protected `main` (a) has `revision ≥ 2` and superseded an existing authorization, (b) has `approvedAt` later than the conflict's `at`, and (c) lists that line's `seq` and SHA-256 in `resolvesConflicts`. No ledger content — `resolvedByRevision`, `revision`, `resolved`, `resolvesConflicts`, a later `SYNC_CONFIRMED` reconciling it, or editing/removing the line — can clear it; such fields are rejected as authority fields. A resolved conflict remains an unreconciled journal event until a `SYNC_CONFIRMED` line reconciles it.

Rules: sequential `seq`, chronological `at`, prior lines immutable, no authority fields (`authorizedActions`, `approver`, `scope`, `ownerGo`, `revision`, `resolvedByRevision`, `resolvesConflicts`, …). Pending or failed synchronization **never** grants authority, never stands for an Owner GO or CI PASS, and must not be reported as completed. When Notion returns, append the journal events in original order and append `SYNC_CONFIRMED` reconciliation lines; never rewrite earlier lines or Notion history.

Notion outage with **no** valid V2 authorization: fail closed (V1).

## Pull request contract

V1 fields stay mandatory, plus:

```text
Authorization Mode: V1
```

or `Authorization Mode: V2`. Exactly one such line, with the value exactly `V1` or `V2`.

| Base state | Declared mode | CI result |
| --- | --- | --- |
| V2 inactive | `V2` | `STOP` — V2 cannot be claimed before activation |
| V2 inactive | anything else | `V1_MANUAL_REVIEW_REQUIRED` (exit 0) — the pre-V2 compatibility path |
| V2 active | missing, duplicated or not exactly `V1`/`V2` | `STOP` — nothing defaults to V1 |
| V2 active | `V1` | `V1_MANUAL_REVIEW_REQUIRED` (exit 0) with a workflow warning |
| V2 active | `V2` | Full verification below; `PASS` or `STOP` |

**V1 is manual governance, never cryptographic authorization.** The V1 path prints `OWNER_SIGNATURE=NOT_CHECKED` and `MANUAL_V1_REVIEW_REQUIRED=YES`; a green `WorkOS Verify` on a V1 PR means only that the metadata is well formed and that no authorization state was altered. The reviewer must still verify the Notion record and Owner GO live. The V1 path remains available after activation because the Owner GO keeps V1 as the fallback for work without a V2 authorization; closing it would be a separate Owner policy decision.

In V2 mode, CI (inside the required `WorkOS Verify` check) verifies the base-signed authorization for the PR's record, branch, repository and changed paths, and reports the sync state. In every mode, once V2 is active, CI refuses PRs that alter authorization state without a valid Owner signature.

## Activation

1. Independent review and a **separate Owner merge decision** for the N-007 PR.
2. The Owner creates their signing key and lands its public key in `owner_allowed_signers` through their own explicit action (this change intentionally cannot pass the agent path; see onboarding below).
3. For each later wave: Owner decision in Notion → Owner signs the manifest (`node scripts/verify-wave-authorization.mjs sign --manifest <file> --key <owner key>`, Owner only) → dedicated authorization PR → merge by the Owner.

Until step 2, no V2 wave can be executable: the verifier stops with "no Owner signing key is registered".

### Owner signing key onboarding

CI refuses every change to `owner_allowed_signers`, so the first key can only land through an Owner-initiated bypass merge — the same mechanism an attacker holding the Owner's GitHub credentials would use. The onboarding is therefore made **verifiable out of band**, not unbypassable:

1. On the Owner's own device, outside any agent session: `ssh-keygen -t ed25519-sk -O verify-required -C <principal>` (FIDO2, touch + PIN), or a passphrase-protected `ed25519` key never added to ssh-agent and never stored on a machine where agents run.
2. The Owner records an Owner decision in Notion with the principal and the key fingerprint (`ssh-keygen -lf <key>.pub`), before the key lands.
3. The Owner opens a dedicated PR touching only `owner_allowed_signers` (`<principal> namespaces="workos-wave-authorization" <public key>`). The expected V2 gate failure is the signal that this path is Owner-only.
4. An independent reviewer compares the fingerprint in the PR with the Notion decision, and confirms the PR was opened by the Owner outside the agent path.
5. The Owner merges with an explicit, journaled bypass. Key rotation or removal repeats steps 2–5; a compromised key is also revoked by withdrawing its authorizations in `revocations.json`.

Agents never generate, register, read or use an Owner signing key.

## Security boundary (reviewed)

| Path | Control | Residual risk |
| --- | --- | --- |
| Candidate posing as protected `main` | CI reads authority only from `HEAD^1` of GitHub's PR merge commit (the base tip); the step runs only on `pull_request` | None in CI beyond the bypass below |
| Local Git reference spoofing | Local `check` trusts the local `origin/main` ref | An agent can move a local ref or edit its own copy of the verifier. Local `check` is self-discipline for an honest agent, **not** enforcement; CI and Owner review are the enforcement |
| Candidate edits to the verifier | CI runs the verifier from the base commit | — |
| Candidate edits to the workflow | None in code: `pull_request` runs the candidate's workflow file | A PR can remove or alter the gate step. Any change to `.github/workflows/**` must be reviewed as governance-sensitive |
| Signer registration | Signers read from base only; any signer-set change fails CI | Owner-only bypass path (onboarding above) |
| Revocation / supersession | Revocations from base and candidate, append-only; revisions must increase; authorizations cannot be deleted | Bypass merges can still alter history |
| Actions and permissions | Non-delegable actions always `STOP`; unknown actions `STOP`; manifests listing them are invalid | — |
| Scope conflicts | Changed-path scope check plus ledger conflicts cleared only by a newer Owner signature | — |
| CI status | Strict `Authorization Mode`; V1 reported as `V1_MANUAL_REVIEW_REQUIRED`, never `PASS`/`VERIFIED` | A green check on a V1 PR is still only metadata validation |

## Limits (not claimed)

- No live Notion verification in CI; that remains R-015.
- No ruleset change. `Protect main process` requires the `WorkOS Verify` check but has `required_approving_review_count = 0` and an always-bypass User actor (`office952`), which is the same account the implementation agent operates (AUD-GOV-001). A holder of those credentials can merge without review, skip the required check, alter the workflow, the signer set or this contract. The signature makes a forged **authorization** detectable by a reviewer, not a bypass merge impossible. Closing this requires a separate Owner decision on the ruleset (e.g. remove the always-bypass actor or restrict it to pull requests, require an approving review from a distinct account).
- CI executes the workflow file from the candidate; a workflow change in a PR is governance-sensitive and must be scrutinised by the reviewer.
- Signature strength equals Owner key custody. A key usable unattended by an agent voids the model.
- A failed or unexecuted CI run (for example a GitHub billing lock that starts no steps) is not evidence of anything; it is neither a PASS nor an assertion failure.

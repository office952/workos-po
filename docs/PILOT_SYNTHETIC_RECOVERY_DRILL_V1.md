# WorkOS controlled pilot — synthetic recovery drill V1

Tracking: [pilot readiness phases](https://github.com/office952/workos-po/issues/55).

**Status: runbook proposal; execution NOT performed.** This document cannot authorize production cutover, real data inspection or writes, or a backup of a real Cloud root.

## Purpose and existing evidence

Confirm the **QUIESCED_OFFLINE_V1** recovery contract on a disposable synthetic WorkOS Cloud root before any real pilot approval. The mechanism already has automated test coverage:

- `apps/api/tests/backup-restore.test.ts`: multi-organization backup/restore, data isolation, missing or tampered artifacts, schema and identity checks, source-root restore refusal.
- `apps/api/tests/cloud-runtime-recovery.test.ts`: API and backup exclusive leases, backup after clean stop, stale lease safeguards, Control snapshot consistency, safe target separation, readiness across multiple planes and production origin protections.
- `docs/PRODUCTION_RUNTIME.md`: canonical production topology and backup boundaries.

Passing tests does not prove an operator executed a recovery drill on the intended platform.

## Preconditions and STOP gates

- [ ] Owner has authorized **synthetic-only** drill execution in a separate step.
- [ ] Repository identity and exact `main` commit are recorded; target tests pass on that SHA.
- [ ] The source root is positively identified as **disposable synthetic data**. No real organization, reference Owner runtime, production data root or unclassified path may be used.
- [ ] API process and storage root ownership can be proven, without terminating any unrelated process.
- [ ] Backup destination is outside source Cloud root. Restore target is a new, absent and independent path outside both source and backup.
- [ ] No credentials, PINs, tokens, customer details, absolute storage paths or session cookies will be attached to the report.

**HARD STOP:** ambiguous path identity, missing synthetic proof, active unknown process/lease, inability to prove shutdown, a nonempty restore target, or an environment variable pointing to real storage.

## Dry review (no Cloud writes)

1. Confirm the exact repo commit, implementation contracts and package scripts.
2. Review `pnpm --filter @workos-final/api cloud:backup` and `pnpm --filter @workos-final/api cloud:restore -- --backup <dir> --target <new-root>` options using CLI help/source. The angle-bracket paths are placeholders; do not run these literal commands without validated synthetic targets.
3. Inspect existing regression results for `backup-restore.test.ts` and `cloud-runtime-recovery.test.ts`.
4. Assign one operator to manage API lifecycle. No parallel actors may use the source root.

## Authorized synthetic drill (a separate GO is required)

1. Provision a **new disposable synthetic** Cloud fixture using supported engineering tooling. Preserve a read-only inventory of synthetic organization count, plane identities, expected migration ledgers and sample document checksums.
2. Start the synthetic API, verify `/api/ready` and the intended test fixtures, and demonstrate that a backup while the API holds the lease is rejected. Do not kill a protected reference runtime.
3. Request a clean API stop through the supported lifecycle and **prove the process is stopped**. An unresolved live/unknown lease is a STOP, not permission to delete the lease.
4. Run the existing backup CLI against the synthetic source root with a separate synthetic backup root. Verify completion and validate the manifest, Control Plane, Operational Planes, documents and integrity checks through the supported validators.
5. Restore through the existing CLI into an **absent, independent synthetic target**. Do not overwrite the original root or create a target beneath source/backup directories.
6. Check restored Control/Operational migration ledgers, plane identity, organization isolation, attachment checksums, readiness and representative frozen business snapshots. Perform the checks through supported APIs/read-only validations.
7. If a runtime startup is part of the drill, start the restored root under its own exclusive lease, check `/api/ready`, stop cleanly, and leave no managed process behind.
8. Record elapsed timings and actionable runbook problems without publishing private environment details. Do not automatically delete source, target or backups as part of this drill.

## Acceptance criteria

- [ ] API-active backup refusal proved.
- [ ] API safely stopped and no live/unknown lease bypassed.
- [ ] Backup manifests and copied data validated.
- [ ] Restore succeeds only to a new independent target.
- [ ] Multiple organizations remain isolated, with correct Control/Operational identity and migration ledgers.
- [ ] Representative synthetic snapshot and document checksums match before/after.
- [ ] Restored runtime readiness is READY only when all active planes validate.
- [ ] Unexpected or tampered restore input fails closed, as backed by automated tests.
- [ ] Operator can follow the procedure without direct SQLite edits or ad-hoc destructive commands.
- [ ] Shutdown and restart responsibility is clear; any incident results in STOP.

A completed synthetic drill is **necessary evidence**, not production deployment authorization.

## Result report contract

```text
BASE_SHA =
TARGET_CLASSIFICATION = SYNTHETIC_ONLY
OWNER_SYNTHETIC_DRILL_GO =
SOURCE_IDENTITY_PROOF =
BACKUP_DESTINATION_SEPARATE =
RESTORE_TARGET_NEW_AND_INDEPENDENT =
API_STOP_PROOF =
LEASE_POLICY_RESULT =
BACKUP_VALIDATION_RESULT =
RESTORE_VALIDATION_RESULT =
ORGANIZATION_ISOLATION_RESULT =
READINESS_RESULT =
DOCUMENT_AND_SNAPSHOT_INTEGRITY =
UNRESOLVED_FINDINGS =
REAL_CLOUD_ACCESSED = NO
REAL_DATA_WRITTEN = NO
VERDICT = PASS / FAIL / NOT_RUN
```

Never paste secrets or sensitive paths into the report.

## Deferred work

Production recovery rehearsals, offsite backup handling, downtime/RTO objectives and real operator training remain separate Owner decisions. Online backup with concurrent writes is **not supported**. No production deployment or first real business operation is authorized by this runbook.

# PILOT-0 synthetic recovery drill — evidence V1

Sanitized evidence for one execution of [the synthetic recovery drill runbook](PILOT_SYNTHETIC_RECOVERY_DRILL_V1.md). Tracking: [controlled pilot readiness #55](https://github.com/office952/workos-po/issues/55).

**Scope: synthetic only.** No real organization, no real Cloud root, no Owner reference runtime and no existing backup destination was used. This is necessary pilot evidence, not deployment, cutover or first-real-job authorization. Owner acceptance of this drill is **pending**.

Raw runtime output, generated databases, backups and the drill-owned helper scripts stay outside Git on the operator workstation. Paths below are placeholders.

## Result report

```text
BASE_SHA = eb3f3c4915e6c18cad91ac613af55fdde934459c
TARGET_CLASSIFICATION = SYNTHETIC_ONLY
OWNER_SYNTHETIC_DRILL_GO = YES (PILOT-0 Owner GO, 2026-10-12)
SOURCE_IDENTITY_PROOF = NEW_ABSENT_PATH + SYNTHETIC_REFERENCE_MARKER + SYNTHETIC_TEST_BOOTSTRAP_POLICY (both organizations)
BACKUP_DESTINATION_SEPARATE = YES (new empty directory, sibling of source, outside source)
RESTORE_TARGET_NEW_AND_INDEPENDENT = YES (absent before restore; not inside source or backup)
API_STOP_PROOF = PASS (exit 0 via shutdownApi; PID gone; port closed; lease removed)
LEASE_POLICY_RESULT = PASS (backup refused cloud_runtime_active; second API refused cloud_runtime_active)
BACKUP_VALIDATION_RESULT = PASS (manifest v1; 4 artifacts; independent SHA-256 recheck 0 mismatches)
RESTORE_VALIDATION_RESULT = PASS (restore_validated; all tables, ledgers, identities, documents equal baseline)
ORGANIZATION_ISOLATION_RESULT = PASS (restored HTTP checks: 403 cross-org login/switch, 404 cross-org reads)
READINESS_RESULT = PASS (/api/ready 200 ready on source and on restored root)
DOCUMENT_AND_SNAPSHOT_INTEGRITY = PASS (document SHA-256 equal; frozen snapshot tables equal by content digest)
UNRESOLVED_FINDINGS = see "Runbook findings"
REAL_CLOUD_ACCESSED = NO
REAL_DATA_WRITTEN = NO
VERDICT = PASS (synthetic operator drill; Owner acceptance pending)
```

## Environment

| Item | Value |
| --- | --- |
| Repository / commit | `office952/workos-po` at `eb3f3c4` (PR #69 merge, equal to `origin/main`) |
| Host class | Owner Windows workstation; Node 24.15.0; pnpm 11.15.1 |
| Drill parent | `<DRILL_PARENT>` — new directory under the user temporary folder, created for this drill; outside Git, worktrees and the reference-runtime root |
| Source root | `<DRILL_PARENT>/source` — absent before provisioning |
| Backup root | `<DRILL_PARENT>/backups` — new and empty |
| Restore target | `<DRILL_PARENT>/restore` — absent before restore |
| Ambient environment | No `WORKOS_*`, `NODE_ENV` or SQLite variables set; every command received explicit variables, removed afterwards |
| Reference runtimes | Ports 8787/8788/8789 not listening before or after; reference root not accessed |
| API mode | Cloud mode, `NODE_ENV` unset (non-production), loopback ports 18931 (source) and 18932 (restored) |
| Regression baseline | `backup-restore.test.ts` + `cloud-runtime-recovery.test.ts`: 36/36 passed on this commit before the drill |

## Synthetic dataset

Created only through supported tooling:

- Organization **WorkOS Test**: `pnpm --filter @workos-final/api cloud:owner-review provision --root <SRC>` (bootstrap `SYNTHETIC_TEST`, writes the `SYNTHETIC_REFERENCE` marker), then `cloud:owner-review seed` through HTTP (`DIRECT_SQL_SEED = NO`): 10 customers, 11 requests, 6 frozen quotes, 3 accepted, 2 released jobs, 1 assembly, 2 people, 3 machines, execution tasks.
- Organization **Drill Synthetic B**: `cloud:provision --org "Drill Synthetic B" --bootstrap-policy SYNTHETIC_TEST --password-stdin`, then one customer through `POST /api/customers`.
- One synthetic text attachment through `POST /api/requests/:requestId/attachments` so the document path carries a real file.

## Baseline inventory (quiesced source)

Read-only inventory (SQLite opened read-only; rows reduced to SHA-256 digests):

| Measure | Value |
| --- | --- |
| Organizations / operational planes | 2 / 2, both ACTIVE |
| Control Plane | integrity `ok`, 2 migrations, 6 tables |
| Each operational plane | integrity `ok`, 40 migrations, 51 tables, plane identity equals Control Plane mapping |
| WorkOS Test nonempty tables | 34 (including `quote_snapshots` 5, `order_snapshots` 2, `accepted_production_snapshots` 1, `assembly_quote_snapshots` 1, `assembly_order_snapshots` 1, `assembly_production_snapshots` 1, `commercial_request_attachments` 1) |
| Drill Synthetic B nonempty tables | 10 (foundation + 1 customer) |
| Documents | WorkOS Test 1 file, Drill Synthetic B 0 files |
| Runtime lease | absent |

## Step matrix

| # | Step | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Verify backup/restore CLI contracts | PASS | Source review of `backupCli.ts`, `restoreCli.ts`, `backup.ts`, `restore.ts`, `runtimeLease.ts`, `startApi.ts`, `serverLifecycle.ts`. The backup and restore CLIs have no `--help`; their contract is the source. |
| 2 | Create isolated synthetic dataset | PASS | Two `SYNTHETIC_TEST` organizations on a new absent root (see above). |
| 3 | Sanitized baseline inventory | PASS | Table above. |
| 4 | Start synthetic API under controlled ownership | PASS (2nd attempt) | Attempt 1 failed inside the drill-owned helper (module-format error) before any lease or root write. Attempt 2: launched PID = drill PID file = lease PID = port listener; command line identified the drill helper. |
| 5 | Readiness and synthetic identity | PASS | `/api/health` ok; `/api/ready` HTTP 200 `ready`, all checks true. |
| 6 | Backup refused while API owns the lease | PASS | `cloud:backup` exit 1, `cloud_runtime_active`; backup root stayed empty; lease unchanged. A second API start on the same root also exited with `cloud_runtime_active` and opened no port. |
| 7 | Stop only the drill-owned API via supported lifecycle | PASS (see finding F1) | PID re-identified by command line, then stopped through `startWorkosApi().close()` → `shutdownApi`; exit 0 in 151 ms. |
| 8 | Clean shutdown and released lease | PASS | PID gone, port closed, `ops/runtime-lease.json` absent, health unreachable. Repeated on a second start/stop cycle. |
| 9 | Offline backup into independent destination | PASS | `cloud:backup` exit 0 in 592 ms; `backup_succeeded` 2 organizations / 2 planes; backup lease released. |
| 10 | Restore into new absent destination | PASS | `cloud:restore -- --backup <BKP>/<backup-dir> --target <RST>` with `WORKOS_CLOUD_ROOT=<SRC>` for isolation checks; exit 0 in 581 ms; `restore_validated`. |
| 11 | Verify restored environment | PASS | Inventory equal to baseline for all 6 Control tables and 51 + 51 plane tables (row counts and content digests), migration ledgers, plane identities, integrity and document SHA-256. Restored root started under its own lease: `/api/ready` 200; HTTP isolation checks below; stopped cleanly. |
| 12 | Negative recovery tests | PASS (2nd attempt for N4–N8) | Table below. First N4–N8 attempt was invalid (fixture copy hit Windows path length and BOM; see F2) and is not counted. |
| 13 | Destructive or ambiguous operations fail closed | PASS | Every negative case failed with a specific code; no partial target remained; populated target unchanged. |
| 14 | Stop all drill-owned processes | PASS | No drill Node process; ports 18931/18932/18939 closed; no lease on source or restore. |
| 15 | Owner reference runtimes unchanged | PASS | 8787/8788/8789 idle before and after (not started, stopped or reclaimed); reference root not accessed. |

Mandatory steps not executed: none. Schema-ledger tampering was **not repeated** in this operator drill; it is covered by automated test `cloud-runtime-recovery.test.ts` F.

## Restored-root isolation (HTTP)

| Check | Result |
| --- | --- |
| WorkOS Test owner lists customers | 10, none from Drill Synthetic B |
| Drill Synthetic B user lists customers | 1, only its own |
| WorkOS Test owner login requesting Drill Synthetic B | 403 |
| WorkOS Test session switching to Drill Synthetic B | 403 |
| Drill Synthetic B reads a WorkOS Test customer by id | 404 |
| WorkOS Test reads a Drill Synthetic B customer by id | 404 |
| Drill Synthetic B lists a WorkOS Test request's attachments | 404 |
| Restored attachment download | 200, SHA-256 equal to the uploaded file |

## Negative recovery tests

Disposable fixtures are full copies of the drill backup with exactly one defect each, built by a drill-owned script. The original backup was never modified (artifact SHA-256 recheck after all tests: 0 mismatches).

| Case | Command shape | Exit | Code | Target after |
| --- | --- | --- | --- | --- |
| N1 restore over the populated restore root | `cloud:restore --backup <bkp> --target <RST>` | 1 | `restore_target_not_empty` | unchanged |
| N2 target nested inside source | `--target <SRC>/nested-restore` | 1 | `restore_target_not_isolated` | not created |
| N3 target nested inside backup directory | `--target <bkp>/nested-restore` | 1 | `restore_target_not_isolated` | not created |
| N4 one document byte appended | fixture | 1 | `hash_mismatch` | not created |
| N5 manifest artifact path `../../escape.txt` | fixture | 1 | `invalid_manifest` | not created |
| N6 manifest version `workos-cloud-backup-v0` | fixture | 1 | `unsupported_backup_version` | not created |
| N7 manifest organization count +1 | fixture | 1 | `invalid_manifest` (post-copy validation) | removed by restore |
| N8 plane SQLite artifact removed | fixture | 1 | `missing_file` | not created |
| N9 backup root inside Cloud root | `cloud:backup` | 1 | `backup_inside_cloud_root` | nothing created, no lease |
| N10 restore without `--target` | `cloud:restore --backup <bkp>` | 1 | `missing_target` | — |

## Command log (sanitized)

| Order | Command | Exit |
| --- | --- | --- |
| 1 | `pnpm --filter @workos-final/api cloud:owner-review provision --root <SRC>` | 0 |
| 2 | `pnpm --filter @workos-final/api cloud:provision --root <SRC> --org "Drill Synthetic B" --email <synthetic> --bootstrap-policy SYNTHETIC_TEST --password-stdin` | 0 |
| 3 | drill helper start, `WORKOS_CLOUD_ROOT=<SRC> PORT=18931` (attempt 1) | 1 (helper module format; no lease) |
| 4 | drill helper start, same (attempt 2) | running |
| 5 | `pnpm --filter @workos-final/api cloud:owner-review seed --root <SRC> --base-url http://127.0.0.1:18931` | 0 |
| 6 | `POST /api/customers` as Drill Synthetic B | HTTP 201 |
| 7 | `pnpm --filter @workos-final/api cloud:backup` with lease live | 1 `cloud_runtime_active` |
| 8 | second drill helper start on `<SRC>` | exit, `cloud_runtime_active` |
| 9 | stop request → `shutdownApi` | 0 |
| 10 | second start/stop cycle + `POST /api/requests/:id/attachments` | HTTP 201; stop 0 |
| 11 | read-only baseline inventory of `<SRC>` | 0 |
| 12 | `pnpm --filter @workos-final/api cloud:backup`, `WORKOS_CLOUD_ROOT=<SRC> WORKOS_BACKUP_ROOT=<BKP>` | 0 |
| 13 | `pnpm --filter @workos-final/api cloud:restore -- --backup <BKP>/<backup-dir> --target <RST>` | 0 |
| 14 | read-only inventories of backup and `<RST>` | 0 |
| 15 | drill helper start on `<RST>`, `PORT=18932`; HTTP readiness and isolation checks; stop | 0 |
| 16 | negative cases N1–N10 | 1 each, codes above |

## Runbook findings

- **F1 — no operator-facing graceful stop on Windows (ADVISORY, runbook gap).** The API installs SIGINT/SIGTERM handlers that call `shutdownApi`. On Windows, signals sent from another process terminate Node immediately, so the handler cannot run and the lease would remain until a later operation proves the PID dead. The drill therefore used a drill-owned host that calls the supported `startWorkosApi().close()` path. On a Linux service manager that sends SIGTERM the installed handler should run, but that was **not verified** in this drill. The deployment runbook must name the stop mechanism for the chosen host.
- **F2 — Windows path length on backup copies (ADVISORY).** Backup artifact paths exceed 260 characters under deep parents. PowerShell `Copy-Item` silently dropped the document while copying a backup. WorkOS backup and restore themselves were not affected. Operators copying backups on Windows need long-path-safe tooling and must verify copies against the manifest hashes.
- **F3 — restore writes SQLite side files into the backup directory (ADVISORY).** Read-only validation of WAL-mode databases creates `-wal`/`-shm` files beside the backup artifacts. Manifest artifacts stay byte-identical. Treat backup validity as manifest-hash equality, not as an unchanged directory listing. Restoring from write-protected media was not tested.
- **F4 — no `--help` on backup/restore CLIs (MINOR).** Operators rely on documentation and source for their options.

None of these findings were patched in PILOT-0 (documentation-only scope).

## Limits

- One synthetic workstation execution on Windows. Not the intended deployment host, not production mode (`NODE_ENV=production` requires an HTTPS public origin), not a real Cloud root.
- Not proof of recovery time objectives, offsite backup handling or operator training.
- The drill-owned helper scripts are not part of WorkOS; they used only exported WorkOS functions and supported CLIs.

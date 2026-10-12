# WorkOS controlled pilot — deploy, rollback and incident STOP runbook V1

Tracking: [controlled pilot readiness #55](https://github.com/office952/workos-po/issues/55).

**Status: TEMPLATE. Not executed. Not accepted.** Nothing in this document authorizes deployment, real Cloud access, real data writes, migrations, cutover or a first real job. Each of those needs a separate, explicit Owner GO naming the exact target.

Fill in placeholders **outside Git** (operator's private change record). Never commit hostnames, IP addresses, real paths, credentials, tokens, PINs, cookies or personal data. Commands are shown as the supported shape only; running any of them on a real target requires the matching Owner gate.

Canonical contracts this runbook relies on: [production runtime](PRODUCTION_RUNTIME.md), [pilot readiness gate](PILOT_READINESS_GATE_V1.md), [organization setup](PILOT_ORGANIZATION_SETUP_V1.md), [synthetic recovery drill](PILOT_SYNTHETIC_RECOVERY_DRILL_V1.md).

## 1. Change record (fill outside Git)

| Field | Value |
| --- | --- |
| Target host identity | `<TARGET_HOST>` (machine name / provider instance id; OS and version) |
| WorkOS public HTTPS origin | `<WORKOS_PUBLIC_ORIGIN>` — normalized `https://` origin, no path |
| Additional trusted origins | `<WORKOS_TRUSTED_ORIGINS>` or none |
| TLS / reverse proxy owner | `<PROXY_OWNER>`; proxy product and config location `<PROXY_CONFIG_REF>` |
| Application artifact identity | `main` commit `<RELEASE_SHA>`; WorkOS Verify run `<CI_RUN_ID>`; build artifact digest `<ARTIFACT_SHA256>` |
| Previous artifact (rollback target) | commit `<PREVIOUS_SHA>`; digest `<PREVIOUS_ARTIFACT_SHA256>` |
| Cloud data root | `<WORKOS_CLOUD_ROOT>` — local or block storage, never a network filesystem |
| Independent backup root | `<WORKOS_BACKUP_ROOT>` — outside the Cloud root, separate failure domain where possible |
| Static frontend root | `<WORKOS_STATIC_ROOT>` |
| Bind address / port | `<HOST>` (typically `127.0.0.1` behind the proxy) / `<PORT>` |
| Responsible platform operator | `<OPERATOR>` — the only actor allowed to start/stop the API and run backup/restore |
| Owner approver | `<OWNER>` |
| Planned change window | `<START>` – `<END>` (timezone `<TZ>`) |
| Communication channel | `<CHANNEL>` |
| Stop mechanism for this host | `<STOP_MECHANISM>` — see section 6 |

## 2. Gates before any action

```text
OWNER_GO_FOR_THIS_TARGET = <YES/NO>        # names host, roots, origin, window
OWNER_GO_SCOPE = <READ_ONLY_PREFLIGHT | DEPLOY | RESTORE | FIRST_REAL_JOB>
RELEASE_SHA_EQUALS_VERIFIED_MAIN = <YES/NO>
WORKOS_VERIFY_GREEN_ON_RELEASE_SHA = <YES/NO>
SYNTHETIC_RECOVERY_DRILL_ACCEPTED = <YES/NO>
OPERATOR_IDENTIFIED = <YES/NO>
ROLLBACK_TARGET_IDENTIFIED = <YES/NO>
```

Any `NO` is a STOP. A green `pnpm pilot:preflight` never authorizes a deploy by itself.

## 3. Environment variables

Set on the target only; never in Git. Contract: [production runtime — required environment](PRODUCTION_RUNTIME.md#required-environment).

| Variable | Required | Rule |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `WORKOS_CLOUD_ROOT` | yes | External persistent root |
| `WORKOS_BACKUP_ROOT` | yes | Outside the Cloud root |
| `WORKOS_PUBLIC_ORIGIN` | yes | Normalized `https://` origin; startup fails closed otherwise |
| `WORKOS_TRUSTED_ORIGINS` | optional | Each entry a normalized `https://` origin |
| `WORKOS_STATIC_ROOT` | yes | Built frontend directory |
| `HOST`, `PORT` | yes | Loopback bind behind the proxy |
| `WORKOS_SQLITE_PATH` | must be unset | Conflicts with Cloud mode |

## 4. Maintenance and downtime

Backup mode is `QUIESCED_OFFLINE_V1`: every backup and every deploy that needs a fresh backup requires API downtime. Online backup under concurrent writes is not supported.

1. Announce the window on `<CHANNEL>`; confirm no operator is mid-task.
2. Proxy shows a maintenance response for `/` and `/api/*` (`<PROXY_MAINTENANCE_METHOD>`), or the proxy is left pointing at a stopped upstream.
3. Record start time.

## 5. Pre-deploy backup checks

1. Confirm the API is the only process using `<WORKOS_CLOUD_ROOT>` and record its PID and command line.
2. Stop the API through `<STOP_MECHANISM>` (section 6). Prove: process gone, port closed, `ops/runtime-lease.json` absent.
3. If a lease remains and its PID is alive or unknown: **STOP**. Never delete the lease file by hand.
4. Run the quiesced backup:

   ```text
   pnpm --filter @workos-final/api cloud:backup     # WORKOS_CLOUD_ROOT, WORKOS_BACKUP_ROOT set
   ```

5. Record the printed backup directory name (not its full path) and exit code. Exit ≠ 0 is a STOP.
6. Verify `manifest.json`: version `workos-cloud-backup-v1`, organization and plane counts, and SHA-256 of every artifact. Copy backups only with long-path-safe tooling and re-verify hashes after copying.

## 6. Stop mechanism (host-specific, must be decided)

The API releases its lease only through `shutdownApi`, triggered by SIGINT/SIGTERM handlers in-process.

| Host class | Known behavior | Status |
| --- | --- | --- |
| Linux service manager sending SIGTERM | Installed handler should run `shutdownApi` | **Not verified** on a real host |
| Windows | Signals from another process terminate Node before the handler runs; lease remains until a later operation proves the PID dead | Observed in the PILOT-0 drill |
| Hard kill (any OS) | Lease remains; next start/backup recovers it only after proving the PID dead | Fail-closed by design |

`<STOP_MECHANISM>` must be chosen and verified on the target class before Gate B. Decision owner: Owner + platform operator.

## 7. Deploy and startup (shape only)

Production artifact packaging is **not defined** by the repository today. The only API start script is `pnpm --filter @workos-final/api start` (TypeScript source through `tsx`). The Owner/operator must decide the artifact form before Gate B.

Supported build commands on the exact release commit:

```text
pnpm install --frozen-lockfile
pnpm verify:all
pnpm build              # frontend → WORKOS_STATIC_ROOT source
pnpm engine:build       # domain + API compile check
```

Startup sequence:

1. Place the artifact for `<RELEASE_SHA>`; keep `<PREVIOUS_SHA>` artifact intact for rollback.
2. Start the API with the environment from section 3 under `<OPERATOR>`'s service definition.
3. Startup must acquire the `api` lease. `cloud_runtime_active` or `cloud_runtime_lease_indeterminate` is a STOP.
4. Startup must fail closed if `WORKOS_PUBLIC_ORIGIN` is missing or not HTTPS — fix configuration, never bypass.

Migrations: the API applies its own supported migrations at startup. Restore only accepts backups whose ledgers equal the current supported schema (`schema_mismatch` otherwise). No manual SQL, no ad-hoc migration.

## 8. Health, readiness and preflight

| Probe | Expectation |
| --- | --- |
| `GET <WORKOS_PUBLIC_ORIGIN>/api/health` | 200, `status: ok`, contract id published |
| `GET <WORKOS_PUBLIC_ORIGIN>/api/ready` | 200 `ready`; 503 means a Control or Operational Plane is invalid |
| `pnpm pilot:preflight --json` (read-only) | Exit 0 READY; 2 blocked; 3 inspection failed closed |
| HSTS / cookies | HSTS on `/`, assets and `/api/*`; session cookie `HttpOnly`, `Secure`, `SameSite=Lax` |
| Mutating request from an untrusted origin | Refused |

Store only sanitized outputs (exit codes, check identifiers). Preflight checks infrastructure, not business readiness.

## 9. Post-deploy verification

1. Owner/operator log in through the browser at the public origin.
2. Correct organization and memberships only; organization switch limited to memberships.
3. Read-only pages load: Cereri, Oferte, Lucrări, Atelier, Admin.
4. No business write is performed unless the first-real-job GO exists.
5. Record end time and result on `<CHANNEL>`.

## 10. Rollback

**Application rollback and data restoration are different operations.** Prefer application rollback; restore data only when data is damaged and only under a restore GO.

Rollback triggers (any one):

- `/api/ready` not ready after deploy, or preflight exit ≠ 0
- startup fails with origin, lease, migration or plane-identity errors
- cross-organization access, wrong totals or missing frozen snapshots observed
- Owner or operator calls STOP

### 10a. Application-code rollback

1. Stop the API (section 6); prove stopped and lease released.
2. Switch to the `<PREVIOUS_SHA>` artifact.
3. **Compatibility limit:** if the new release applied a migration, the previous code may not accept the migrated databases. Do not start older code against newer ledgers. In that case go to 10b with the pre-deploy backup.
4. Start, then run section 8 probes.

### 10b. Data restoration (offline, new root only)

Prerequisites: API stopped and lease released; the pre-deploy backup verified by manifest hashes; a new, absent target path `<RESTORE_TARGET>` outside both Cloud root and backup root; Owner restore GO.

```text
pnpm --filter @workos-final/api cloud:restore -- --backup <BACKUP_DIR> --target <RESTORE_TARGET>
```

- Restore never writes over an existing root. Never restore into a live Cloud root or one whose API holds a lease.
- After `restore_validated`, the operator repoints `WORKOS_CLOUD_ROOT` to `<RESTORE_TARGET>` (with the matching artifact) and keeps the damaged root untouched for investigation.
- Any `hash_mismatch`, `invalid_manifest`, `schema_mismatch`, `plane_identity_mismatch` or `restore_target_*` code is a STOP. Do not edit manifests or databases to force a restore.

## 11. Incident STOP procedure

Trigger: suspected data exposure across organizations, wrong commercial totals reaching a customer, corrupted plane, unknown process on the Cloud root, unexpected lease, or any instruction from the Owner.

1. **Stop new writes:** proxy to maintenance; stop the API through `<STOP_MECHANISM>`.
2. **Preserve:** do not delete, reset, recreate or "clean" the Cloud root, leases or backups. Do not run reset or seed tooling.
3. **Snapshot evidence:** once quiesced, run a backup to a **new** directory under `<WORKOS_BACKUP_ROOT>` if the Owner approves; record exit codes.
4. **Notify** `<OWNER>` on `<CHANNEL>` with time, symptom, affected surface, actions taken.
5. **Do not restart** until the Owner decides between restart, application rollback (10a) or data restore (10b).

## 12. Recovery verification

- `/api/ready` 200 and preflight exit 0 on the recovered root.
- Organization and plane counts equal the chosen backup manifest.
- Representative frozen quotes/orders open with unchanged totals.
- Cross-organization access refused (login to a foreign organization and organization switch return 403).
- Document downloads match recorded checksums where available.

## 13. Audit evidence (sanitized, outside Git unless sanitized)

```text
RELEASE_SHA =
CI_RUN_ID =
ARTIFACT_SHA256 =
CHANGE_WINDOW = <start/end>
OPERATOR = <role, not personal data>
PRE_DEPLOY_BACKUP_EXIT =
BACKUP_MANIFEST_ORGS / PLANES =
API_STOP_PROOF =
STARTUP_LEASE_ACQUIRED =
READY_HTTP =
PREFLIGHT_EXIT =
POST_DEPLOY_CHECKS =
ROLLBACK_PERFORMED = NO / APP / DATA
INCIDENT = NO / <reference>
OWNER_DECISION =
```

Keep operational logs as event names only; they must not contain passwords, tokens, PINs, attachment bytes or avoidable paths.

## 14. Owner approval points

| Point | Who | Required before |
| --- | --- | --- |
| Target identity and window | Owner + operator | Any real-environment command |
| Read-only preflight GO | Owner | `pnpm pilot:preflight` on the target |
| Stop mechanism and artifact form | Owner + operator | Gate B |
| Deploy GO | Owner | Section 7 on the target |
| Restore GO | Owner | Section 10b |
| First real job GO | Owner | Any real business write |

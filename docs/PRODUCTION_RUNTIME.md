# Production runtime contract

Living operator-safe contract for WorkOS PO Cloud runtime. This is not a cutover authorization.

Primary product direction is SaaS. Primary product runtime is Cloud. Normal WorkOS startup requires `WORKOS_CLOUD_ROOT` and fails closed without it. Local loopback runtimes and synthetic Cloud roots are engineering infrastructure, not a customer product variant.

```text
DEPLOY_PRODUCTION = HOLD
CUTOVER = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = HOLD
REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
BACKUP_MODE = QUIESCED_OFFLINE_V1
CLOUD_RUNTIME_RECOVERY_SYNTHETIC_PROOF = COMPLETE
ONLINE_BACKUP_WITH_CONCURRENT_BUSINESS_WRITES = NOT_YET_SUPPORTED
UNATTENDED_STALE_LEASE_CONCURRENT_RECOVERY = FUTURE_HARDENING
PRODUCTION_PUBLIC_ORIGIN_REQUIRED = YES
PRODUCTION_ORIGIN_MISSING = FAIL_CLOSED
PRODUCTION_ORIGIN_HTTP_PUBLIC = FAIL_CLOSED
HSTS_AUTHORITY = WORKOS_APPLICATION
```

## Topology

```text
HTTPS reverse proxy
→ same-origin frontend (built static files)
→ /api/*
→ single WorkOS Node API process
→ WORKOS_CLOUD_ROOT
   → control/control-plane.sqlite
   → organizations/<plane>/product-system.sqlite
   → organizations/<plane>/documents/
   → ops/runtime-lease.json
```

```text
PROCESS_MODEL = SINGLE_API_PROCESS
STORAGE = LOCAL_OR_BLOCK
SQLITE = ONE_OPERATIONAL_PLANE_PER_ORGANIZATION
FRONTEND_API = SAME_ORIGIN
VITE_IN_PRODUCTION = NO
CROSS_ORIGIN_DEFAULT = NO
NETWORK_FILESYSTEM_SQLITE = NO
POSTGRES = NO
KUBERNETES = NO
REDIS = NO
MULTI_API_REPLICAS = NO
```

Do not redesign tenancy. Do not add `organization_id` to operational tables.

## Required environment

Safe examples only. Never commit secrets or real Cloud paths.

| Variable | Role |
| --- | --- |
| `NODE_ENV=production` | Production cookie / origin / HSTS policy |
| `HOST` | Bind address, typically `127.0.0.1` behind the proxy |
| `PORT` | API listen port |
| `WORKOS_CLOUD_ROOT` | External persistent Cloud root. Not in Git. |
| `WORKOS_BACKUP_ROOT` | Backup destination **outside** the Cloud root |
| `WORKOS_PUBLIC_ORIGIN` | Required production Cloud public origin. Must be a normalized `https://` origin with no path, query, hash, or userinfo. |
| `WORKOS_TRUSTED_ORIGINS` | Optional extra allowed mutating origins. In production Cloud each entry must be a normalized `https://` origin. |
| `WORKOS_STATIC_ROOT` | Built frontend directory served by the API |

`WORKOS_CLOUD_ROOT` remains external persistent storage. Real business data must not live in Git.

Production Cloud startup fails closed when `WORKOS_PUBLIC_ORIGIN` is missing, malformed, or not HTTPS. That is configuration, not a temporary dependency outage. Local loopback HTTP origins are not a production Cloud public origin.

## Runtime lease

One exclusive Cloud-root lease lives at `ops/runtime-lease.json`. It is operational metadata, not Product Truth. It may contain only `pid`, `startedAt`, `leaseId`, and `purpose` (`api` or `backup`).

```text
ONE CLOUD ROOT = ONE EXCLUSIVE LEASE
API START = acquire purpose=api or refuse
BACKUP = acquire purpose=backup before the first Control snapshot; release after the manifest is written
ANY LIVE LEASE = refuse API start and refuse a second backup
STALE LEASE = recover only after the recorded process is proven not alive
LIVENESS UNKNOWN = FAIL_CLOSED
CLEAN SHUTDOWN / BACKUP FINALLY = remove only this operation's lease
```

## Health and readiness

`GET /api/health` stays lightweight: process is up and the contract id is published.

`GET /api/ready` is production readiness. In Cloud mode it inspects the Control Plane and **every active Operational Plane**: database present, current migration contract valid, plane identity valid. If any active plane is invalid, readiness is `not_ready` and HTTP 503. The public body stays aggregate booleans. It must not expose paths, emails, organization IDs, plane keys, filenames, or stack traces.

## Pilot preflight

Canonical invocation:

```text
pnpm pilot:preflight
```

This command is read-only. It inspects build artifacts, production configuration, the Control Plane, active Operational Planes, the runtime lease, backup/restore support, and provisioning debt. It does not create organizations, migrate databases, acquire or remove a lease, back up, restore, or write a readiness marker.

```text
PRODUCTION_PILOT_READINESS_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_PRODUCTION_PILOT_READINESS_V1 = YES
PREFLIGHT_ENGINE = SYNTHETICALLY_PROVEN
REAL_ENVIRONMENT_PREFLIGHT = NOT_RUN
DEPLOY_PRODUCTION = HOLD
CUTOVER = HOLD
REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
FIRST_REAL_BUSINESS_OPERATION = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = HOLD
NEXT_WAVE_AUTHORIZED = NO
```

Exit `0` means READY. Exit `2` means blocked by configuration or readiness. Exit `3` means inspection failed closed. `--json` prints the same result object. Output must stay free of passwords, tokens, paths, and customer identifiers.

An existing valid organization can be READY while production organization provisioning stays `NOT_READY` / `ADMIN_TOOLING_DEBT`. Requesting a new production organization is blocked until a supported production provisioning mechanism exists. General SaaS debts (signup, email verification, password recovery, MFA, billing, commercial onboarding) are advisories for a controlled pilot. Optional modules such as Site Installation and product enablement are not pilot blockers.

Pilot preflight reuses `evaluateReadiness`. It may be stricter than `GET /api/ready`. It must not report READY when that evaluator reports not ready. The preflight engine is Owner-accepted on synthetic proof. A real environment preflight has not been run. This acceptance does not authorize deployment, cutover, or a real Cloud inspection.

## Backup and restore

```text
BACKUP_MODE = QUIESCED_OFFLINE_V1
```

Supported production backup remains an operator-controlled quiesced operation:

```text
STOP API
→ VERIFY STOPPED
→ BACKUP
→ VALIDATE
→ START API
```

Do not enable unattended scheduled production backup with automatic service restart yet. Concurrent recovery of an unattended stale lease is future hardening. This advisory does not reopen Cloud Runtime and Recovery V1.

```text
pnpm --filter @workos-final/api cloud:backup
pnpm --filter @workos-final/api cloud:restore -- --backup <dir> --target <new-root>
```

```text
ONLINE_BACKUP_WITH_CONCURRENT_BUSINESS_WRITES = NOT_YET_SUPPORTED
```

A live Cloud API lease refuses backup with `cloud_runtime_active`. While backup holds the exclusive lease, API start and a second backup are refused. Per-SQLite `better-sqlite3` `.backup()` is a consistent snapshot of that one file. It is not global application consistency while the API can accept writes. V1 does not pretend otherwise.

After the API is quiesced, backup snapshots Control Plane first, reads organization / plane inventory from **that Control snapshot**, then snapshots each Operational Plane and copies documents. Backup does not invent migration IDs from source files. Every backed-up plane must match the current supported schema. Restore validates Control and Operational migration ledgers against the current supported schema **before** any automatic migration can modify a restored database. Incompatible backups fail closed with `schema_mismatch`.

```text
RESTORE_SUPPORTED_SCHEMA = CURRENT_SUPPORTED_SCHEMA
```

Restore writes only to a new isolated root. Artifact paths must resolve inside the backup directory. The restore target must not equal, contain, or be nested inside the source Cloud root or the backup artifact directory.

Offsite vendor upload is a reserved future seam. This V1 destination is a local `WORKOS_BACKUP_ROOT`.

## Security

Preserved:

- HttpOnly Cloud session cookie
- Secure when the public origin is HTTPS
- SameSite=Lax
- server-side session and active organization
- membership enforcement
- operator-session clear on organization switch
- plane identity verification
- owner-write enforcement

Production Cloud mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) require `Origin` to match the normalized trusted origin set. An empty trusted set does not allow all origins.

The WorkOS application is the HSTS authority. When `NODE_ENV=production` and the request is known to be HTTPS through the trusted proxy / public HTTPS origin, HSTS is applied to **all** responses: `/`, static assets, and `/api/*`.

The reverse proxy must terminate TLS and forward `X-Forwarded-Proto`.

```text
LOGIN_RATE_LIMIT_LIMITATION = PROCESS_LOCAL_IN_MEMORY
```

Login lockout is per API process. It does not survive restart and is not shared across hosts. MFA and password recovery remain future customer-readiness work.

## Provisioning

Dev provision CLI remains refused when `NODE_ENV=production`.

```text
PRODUCTION_ORG_PROVISIONING = ADMIN_TOOLING_DEBT
ADMIN_TOOLING_DEBT = RECORDED_NOT_IMPLEMENTED
```

Recorded, not implemented: self-service signup, email verification, password recovery, MFA, billing/subscriptions, production organization provisioning UX, commercial onboarding automation.

Do not enable unrestricted production provisioning in this wave.

## Observability

Operational logs use event names only: startup, shutdown, Control Plane open failure, migration failure, plane identity failure, backup success/failure, restore validation success/failure. They must not include passwords, session tokens, PINs, attachment bytes, or avoidable filesystem paths.

## Product identity

```text
ONE WORKOS CODEBASE
PRODUCT_MODEL = SAAS_ONLY
PRIMARY_PRODUCT_DIRECTION = SAAS
PRIMARY_PRESENTATION = UI20
PRIMARY_ACCESS = BROWSER
PRIMARY_AUTH = EMAIL_PASSWORD
PRIMARY_SESSION = SERVER_SIDE_CLOUD_SESSION
PRIMARY_TENANCY = ORGANIZATION
PRIMARY_RUNTIME = CLOUD
PRIMARY_PRODUCTION_TOPOLOGY = SAME_ORIGIN_HTTPS
ALTERNATIVE_PRODUCT_DELIVERY = NO
CLIENT_SPECIFIC_FORKS = NO
ORGANIZATION_TENANCY = PRESERVED
```

There must not be separate Cloud product code, a second customer-delivery track, or client-specific forks. Frontend, API, domain, business logic, migrations, and Product Truth stay shared. HUB MEDIA is a validation organization, not a client-specific codebase.

Normal customers use the browser SaaS product. They do not need Cursor, source access, or direct SQLite edits. Synthetic development provisioning is bootstrap tooling, not customer onboarding UX.

## Engineering synthetic reference runtime

This is local engineering infrastructure. It is not production, not real Cloud, and not Product Truth.

```text
REFERENCE_URL = http://127.0.0.1:8787
REFERENCE_PORT = 8787
REFERENCE_CLASSIFICATION = SYNTHETIC_REFERENCE
REAL_HUB_MEDIA = NO
REAL_CLOUD = NO
```

Default data root is user-local, outside Git/worktrees:

- Windows: `%LOCALAPPDATA%\WorkOS\reference-runtime`
- Override: `WORKOS_REFERENCE_ROOT`

The reference process does not inherit ambient `WORKOS_CLOUD_ROOT`. An existing directory with business storage but without the `SYNTHETIC_REFERENCE` marker is refused.

Engineering commands:

- `pnpm reference:start`
- `pnpm reference:status`
- `pnpm reference:restart`
- `pnpm reference:seed`
- `pnpm reference:stop`

`reference:start` and `reference:restart` always run `pnpm build` before launching a new reference process. `reference:status` does not rebuild. The launched process command line includes `--workos-reference-runtime`. `reference:stop` / `reference:restart` terminate only a recorded `SYNTHETIC_REFERENCE` process on port 8787 whose live command line contains that marker. If the command line cannot be read, or the marker is absent, the process is not killed.

Port 8787 is protected Owner reference. Generic `ports:reclaim` / `dev:canonical` must not terminate it. Automated tests use isolated non-8787 ports.

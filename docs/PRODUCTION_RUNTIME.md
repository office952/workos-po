# Production runtime contract

Local product mode is a separate deployment profile. See `docs/LOCAL_RUNTIME.md`. Do not point Local proof at `WORKOS_CLOUD_ROOT`.

Living operator-safe contract for WorkOS PO Cloud runtime. This is not a cutover authorization.

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
```

Do not enable unrestricted production provisioning in this wave.

## Observability

Operational logs use event names only: startup, shutdown, Control Plane open failure, migration failure, plane identity failure, backup success/failure, restore validation success/failure. They must not include passwords, session tokens, PINs, attachment bytes, or avoidable filesystem paths.

## Local and Cloud profiles

```text
ONE WORKOS CODEBASE
DEPLOYMENT_PROFILES = LOCAL | CLOUD
```

There must not be separate local product code, separate Cloud product code, or client-specific forks. Frontend, API, domain, business logic, migrations, and Product Truth stay shared. Deployment and storage configuration may differ.

`WORKOS_LOCAL_RUNTIME_V1` and `WORKOS_LOCAL_INSTALLATION_V1` are complete as isolated synthetic proof. Owner acceptance of a real-machine Local install remains open. See `docs/LOCAL_RUNTIME.md` and `docs/LOCAL_INSTALLATION.md`. Do not install over a real HUB MEDIA data root.

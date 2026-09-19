# Production runtime contract

Living operator-safe contract for WorkOS PO Cloud runtime. This is not a cutover authorization.

```text
DEPLOY_PRODUCTION = HOLD
CUTOVER = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = NO
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
| `WORKOS_PUBLIC_ORIGIN` | Public same-origin URL, e.g. `https://workos.example` |
| `WORKOS_TRUSTED_ORIGINS` | Optional extra allowed mutating origins |
| `WORKOS_STATIC_ROOT` | Built frontend directory served by the API |

`WORKOS_CLOUD_ROOT` remains external persistent storage. Real business data must not live in Git.

## Health and readiness

`GET /api/health` stays lightweight: process is up and the contract id is published.

`GET /api/ready` is production readiness. It checks initialization, Cloud root, Control Plane open, migrations, writable root, and whether an operational plane can be resolved. It must not expose paths, emails, plane keys, filenames, or stack traces.

## Backup and restore

```text
pnpm --filter @workos-final/api cloud:backup
pnpm --filter @workos-final/api cloud:restore -- --backup <dir> --target <new-root>
```

Backup uses the better-sqlite3 consistent snapshot API. It is read-only against business tables. Restore writes only to a new isolated root. Never restore over a live source Cloud root.

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

Added for production:

- Origin validation on mutating requests when `NODE_ENV=production`
- HSTS when the public origin is HTTPS or `X-Forwarded-Proto: https`

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

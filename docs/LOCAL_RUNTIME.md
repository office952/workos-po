# Local runtime

Living operator-safe contract for WorkOS PO **Local** deployment. This is not a Cloud cutover, not an installer acceptance, and not a HUB MEDIA adoption authorization.

```text
DEPLOYMENT_PROFILE = LOCAL
ONE WORKOS CODEBASE = YES
SEPARATE_LOCAL_PRODUCT = NO
VITE_IN_LOCAL_PRODUCT_MODE = NO
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = NO
```

## Architecture

Local is a **deployment profile** of the same product:

```text
browser
→ http://127.0.0.1:<local-port>
→ built static WorkOS frontend (repo `dist/`)
→ same-origin /api
→ single WorkOS Node API
→ local persistent SQLite + documents
```

Shared with Cloud: root frontend, `apps/api`, `packages/domain`, Product Truth, migrations.

Different from Cloud: one local organization/runtime (existing single-plane), one SQLite file, loopback HTTP, no Control Plane, no Cloud membership.

```text
LOCAL  = single_plane API + exclusive local-root lease + built frontend
CLOUD  = Control Plane + Operational Planes + HTTPS production rules
```

Do not set `WORKOS_LOCAL_ROOT` and `WORKOS_CLOUD_ROOT` together. Startup fails closed.

## Directory model

`WORKOS_LOCAL_ROOT` is resolved from the environment. If unset, `pnpm local:start` uses `join(homedir(), "WorkOS", "local")`. That default is not hardcoded as a Windows user path.

```text
WORKOS_LOCAL_ROOT/
  data/
    product-system.sqlite
    documents/
  backups/
  logs/
  config/
    local-profile.json
  ops/
    runtime-lease.json
```

Local data stays outside Git. A local root inside the source tree is refused unless `WORKOS_ALLOW_IN_REPO_LOCAL=1` (not used for product operation). A root that looks like a Cloud root (`control/control-plane.sqlite` or `organizations/`) is refused.

## Startup

Development mode (unchanged):

```text
pnpm dev            # Vite http://127.0.0.1:5173 → proxy /api → 8787
pnpm engine:dev     # API only
```

Local product mode:

```text
pnpm build
pnpm local:start
```

`pnpm local:start`:

- refuses a set `WORKOS_CLOUD_ROOT`
- resolves `WORKOS_LOCAL_ROOT`
- requires `dist/index.html` (or `WORKOS_STATIC_ROOT`)
- initializes or migrates the local database without wiping it
- starts the API
- serves the built frontend on the same origin
- default URL `http://127.0.0.1:8790`

Shutdown: stop the process (Ctrl+C / SIGTERM). The exclusive lease is released. Existing local data is left in place.

## First run and restart

If the local root does not exist, directories and `config/local-profile.json` are created. The database is created by the normal migration path. No synthetic business records are inserted.

If the database already exists, it is opened and migrated. It is not overwritten and not silently reset.

Demo or synthetic data is test-only. It is not part of product initialization.

## Authentication

Local reuses existing **single-plane** session behavior.

```text
GET /api/cloud/session → { mode: "single_plane", user: null, organization: null, memberships: [] }
```

The accepted frontend treats `mode !== "cloud"` as authenticated. No Cloud account is required. No fake Cloud memberships are created.

```text
LOCAL_AUTH_MODEL = SINGLE_PLANE_SESSION
LOCAL_OWNER_MODEL = IMPLICIT_LOCAL_OWNER
CLOUD_LOGIN = NOT_USED
MULTI_USER_LAN_AUTH = NOT_IN_V1
```

`isOwner` is true for every single-plane request. That is the existing local Owner contract, not a new permission system.

## Documents

Request attachments use the same storage primitive as single-plane / Cloud planes: `data/documents/requests/<requestId>/`. Bytes stay on the local root. They are not Cloud objects.

## Backup

Local backup reuses SQLite `.backup()` plus a document file copy. It is not the Cloud multi-organization backup format.

```text
pnpm local:backup
```

The command acquires the same exclusive root lease with `purpose=backup`. A running Local API on that root is refused. Destination defaults to `WORKOS_LOCAL_ROOT/backups/<stamp>/` and contains `product-system.sqlite`, `documents/`, and `manifest.json`.

No scheduled unattended backup in this wave.

Manual restore (later installer may wrap this): stop Local WorkOS, replace `data/` from a backup, start again. There is no Local restore CLI in this wave.

## Runtime exclusivity

The Cloud exclusive-lease primitive (`ops/runtime-lease.json`, `purpose=api|backup`) is reused on the local root. There is no second lock file.

```text
SECOND_LOCAL_RUNTIME_SAME_ROOT = REFUSED
```

A stale lease is recovered only when the recorded process is proven not alive. Unknown liveness fails closed.

## Windows assumptions

```text
PRIMARY_OS = Windows 10/11
WSL_REQUIRED = NO
DOCKER_REQUIRED = NO
BASH_REQUIRED = NO
```

Paths use Node `path` APIs. Start/backup entrypoints are `.mjs` scripts with Windows `shell` spawn.

## Cloud separation

Local proof and Local product mode must not open a real HUB MEDIA Cloud root. Isolated tests use OS temp directories. `pnpm local:start` exits if `WORKOS_CLOUD_ROOT` is set.

## Development vs product

| Mode | Frontend | API | Data |
| --- | --- | --- | --- |
| DEV | Vite 5173 | 8787 (proxy) | developer `WORKOS_DATA_DIR` / SQLite override |
| LOCAL product | built `dist/` on the API port | default 8790 | `WORKOS_LOCAL_ROOT` |

Do not use Vite as the Local product server.

## Future installer / service

This wave prepares the runtime. It does not ship an MSI.

Recommended V1 packaging direction:

```text
PACKAGING_DIRECTION = packaged Node runtime + built frontend + local launcher
WINDOWS_SERVICE_DIRECTION = optional later wrapper around the same local:start entrypoint
ELECTRON_REQUIRED = NO
```

Daily operation target after a later installer wave: a Start WorkOS shortcut that starts the API and opens the local URL. This wave still starts from `pnpm local:start` (terminal required for daily use until that shortcut exists).

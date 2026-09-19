# WorkOS PO

WorkOS PO is the canonical WorkOS product repository.

It contains the preserved accepted frontend, the imported API, domain, persistence implementation, and business engine.

This is not a redesign and not a reconstruction of Pass A.

## Authority

```text
CANONICAL_PRODUCT_REPOSITORY = office952/workos-po
PRESENTATION_AUTHORITY = workos-po root frontend
BUSINESS_ENGINE_AUTHORITY = workos-po/apps/api + workos-po/packages/domain
PERSISTENCE_IMPLEMENTATION_AUTHORITY = workos-po/apps/api
SOURCE_CODE = workos-po
REAL_BUSINESS_DATA = external persistent WorkOS data root / Operational Planes
```

Historical provenance, not continuing development pins:

```text
HISTORICAL_PRESENTATION_SOURCE = office952/workos-ui20
HISTORICAL_PRESENTATION_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366
HISTORICAL_ENGINE_SOURCE = office952/workos-final
HISTORICAL_ENGINE_HEAD = 084ddebb02950d058554eec01f3dc347790f4ca1
```

See `docs/PROVENANCE.md` and `docs/SOURCE_OF_TRUTH.md`.

## Local runtime

Two distinct modes:

```text
DEV              = Vite 127.0.0.1:5173 → proxy /api → 127.0.0.1:8787
LOCAL product    = built frontend + API on http://127.0.0.1:8790
```

Development (unchanged):

```text
frontend 127.0.0.1:5173
/api proxy → 127.0.0.1:8787
contract workos-ui-contract-v1
```

Local product mode (not Vite):

```text
pnpm build
pnpm local:start
```

See `docs/LOCAL_RUNTIME.md` and `docs/LOCAL_INSTALLATION.md`. Do not set `WORKOS_CLOUD_ROOT` for Local.

```text
pnpm install --frozen-lockfile
pnpm ports:reclaim
pnpm dev              # frontend http://127.0.0.1:5173 → /api 127.0.0.1:8787
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm engine:dev       # imported API, default 8787
pnpm engine:typecheck
pnpm engine:test
pnpm engine:lint
pnpm engine:build
pnpm package:local    # Windows Local install package under .tmp/workos-local-package
```

Isolated engine proof may use `PORT=8788` plus a temporary SQLite path, and `WORKOS_API_PROXY_TARGET=http://127.0.0.1:8788` for a non-default frontend port. The default frontend proxy remains 8787.

Do not run `ports:reclaim` while an Owner reference runtime is already using 5173 / 8787.

Do not point local proof at a real Cloud root or real business database without an explicit Owner GO.

## This repository owns

- UI, UX, layout, presentation, adapters
- API
- domain
- persistence implementation
- business engine

The root frontend still must not hardcode Product Truth, pricing, eligibility, or execution.

## This repository does not own

- real customer / operational data
- the external `WORKOS_CLOUD_ROOT`
- later commits in `workos-ui20` or `workos-final`

## Current program

```text
FRONTEND_PRESERVATION_SEED = COMPLETE
ENGINE_CONSOLIDATION_V1 = COMPLETE
WORKOS_PO_CLOUD_RUNTIME_AND_RECOVERY_V1 = COMPLETE
BACKUP_MODE = QUIESCED_OFFLINE_V1
WORKOS_LOCAL_RUNTIME_V1 = COMPLETE_ISOLATED_SYNTHETIC
LOCAL_RUNTIME_LOOPBACK_ONLY_V1 = COMPLETE
WORKOS_LOCAL_INSTALLATION_V1 = COMPLETE_ISOLATED_SYNTHETIC
WORKOS_LOCAL_RUNTIME_AND_INSTALLATION_V1 = COMPLETE_ISOLATED_SYNTHETIC
LOCAL_SHORTCUT_LAUNCH_CLOSURE_V1 = COMPLETE_ISOLATED_SYNTHETIC
LOCAL_PACKAGING_REALITY_CLOSURE_V1 = COMPLETE_ISOLATED_SYNTHETIC
LOCAL_RUNTIME_OWNER_ACCEPTED = NO
LOCAL_INSTALLATION_OWNER_ACCEPTED = NO
NEXT_PROGRAM_PRIORITY = CONTROLLED_OWNER_MACHINE_LOCAL_INSTALLATION_REHEARSAL
NEXT_PROGRAM_STATUS = NOT_STARTED
REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
DEPLOY = HOLD
CUTOVER = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = HOLD
REAL_HUB_MEDIA_LOCAL_ADOPTION = HOLD
```

See `docs/PRODUCTION_RUNTIME.md` for the production topology. Do not point proof runtimes at a real HUB MEDIA Cloud root.

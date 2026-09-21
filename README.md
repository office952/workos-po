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

## Development

WorkOS is a SaaS-only product: browser access, email/password Cloud session, organization tenancy. Local loopback, synthetic Cloud roots, and developer tooling are engineering infrastructure, not product variants.

```text
DEV = Vite 127.0.0.1:5173 → proxy /api → Cloud API 127.0.0.1:8787
```

Normal local development uses the Cloud auth/organization model with an isolated synthetic Cloud root. Vite remains the frontend. The product entrypoint fails closed without `WORKOS_CLOUD_ROOT`.

```text
pnpm install --frozen-lockfile
pnpm ports:reclaim
pnpm dev:cloud        # isolated synthetic Cloud API on 127.0.0.1:8787
pnpm dev              # frontend http://127.0.0.1:5173 → /api 127.0.0.1:8787
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm engine:typecheck
pnpm engine:test
pnpm engine:lint
pnpm engine:build
```

`pnpm dev:cloud` provisions a disposable synthetic identity under `.tmp/workos-dev-cloud` (gitignored) and binds the API to `127.0.0.1`. It never uses a real HUB MEDIA Cloud root or production credentials.

Development login (isolated synthetic Cloud only):

```text
Email:         dev@workos.local
Password:      workos1234
Organization:  WorkOS Dev
```

Isolated engine proof may use `PORT=8788` plus `WORKOS_CLOUD_ROOT` on a disposable root, and `WORKOS_API_PROXY_TARGET=http://127.0.0.1:8788` for a non-default frontend port. The default frontend proxy remains 8787.

Do not run `ports:reclaim` while an Owner reference runtime is already using 5173 / 8787.

Do not point development or proof at a real Cloud root or real business database without an explicit Owner GO.

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
PRODUCT_MODEL = SAAS_ONLY
PRIMARY_PRODUCT_DIRECTION = SAAS
PRIMARY_PRESENTATION = UI20
PRIMARY_ACCESS = BROWSER
PRIMARY_AUTH = EMAIL_PASSWORD
PRIMARY_SESSION = SERVER_SIDE_CLOUD_SESSION
PRIMARY_TENANCY = ORGANIZATION
PRIMARY_RUNTIME = CLOUD
PRIMARY_PRODUCTION_TOPOLOGY = SAME_ORIGIN_HTTPS
ONE_WORKOS_CODEBASE = YES
ONE_BUSINESS_ENGINE = YES
ONE_PRODUCT_TRUTH = YES
NO_CLIENT_CODE_FORK = YES
ALTERNATIVE_PRODUCT_DELIVERY = NO
PRIMARY_USER_JOURNEY = COMPLETE
PRIMARY_USER_JOURNEY_PROOF = SYNTHETIC_SAAS_E2E
CURRENT_PROGRAM = PRODUCT_ENABLEMENT_ADMIN_V1
CURRENT_PROGRAM_STATUS = COMPLETE
NEXT_PROGRAM_PRIORITY = NOT_SELECTED
NEXT_PROGRAM_STATUS = PENDING_ROADMAP_REVIEW
NEXT_PROGRAM_SELECTION = PENDING_ROADMAP_REVIEW
CF4 = COMPLETE
CF4_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF4_INTEGRATED_ON_MAIN = YES
CF5 = NOT_STARTED
STANDALONE_CF5_REQUIRED_BEFORE_LETTERS = NO
REMAINING_CONFIGURATION_FIRST_WORK = DOMAIN_BY_DOMAIN_WHEN_REQUIRED
LETTERS_PRODUCT_TRUTH_V1 = COMPLETE
LETTERS_PRODUCT_TRUTH_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES
LETTERS_PRODUCT_TRUTH_V1_INTEGRATED_ON_MAIN = YES
PR_15 = MERGED
ACM_PRODUCT_TRUTH_V1 = COMPLETE
ACM_PRODUCT_TRUTH_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES
ACM_PRODUCT_TRUTH_V1_INTEGRATED_ON_MAIN = YES
PR_17 = MERGED
PRODUCT_ENABLEMENT_ADMIN_V1 = COMPLETE
PRODUCT_ENABLEMENT_ADMIN_V1_OWNER_ACCEPTED_IMPLEMENTATION = YES
PRODUCT_ENABLEMENT_ADMIN_V1_INTEGRATED_ON_MAIN = YES
PR_19 = MERGED
PRODUCT_ENABLEMENT = ORGANIZATION_SCOPED
CONFIGURATION_SURFACE = /admin/products
CURRENT_TWO_PRODUCTS_DEFAULT = ENABLED
FUTURE_UNCONFIGURED_PRODUCT = FAIL_CLOSED
HISTORICAL_LIFECYCLE = PRESERVED
ACM_TEMPLATE_VERSION = 2
FRAME_CLEARANCE = ORGANIZATION_CONFIGURABLE_VERSIONED
CLIENT_PRODUCT_DEFINITION_AUTHORITY = REMOVED
VALUES_CRV1_AUTHORITY = REQUIRED
NEXT_WAVE_AUTHORIZED = NO
FORMULA_CONFIGURABILITY_FULLY_DELIVERED = NO
CONFIGURATION_FIRST_CANON = docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md
REAL_CLOUD_WRITE = HOLD
REAL_DB_WRITE = HOLD
DEPLOY = HOLD
CUTOVER = HOLD
REAL_HUB_MEDIA_CLOUD_ROOT_ACCESS = HOLD
```

Product Enablement Admin V1 is complete, Owner-accepted, and integrated on main through PR #19. Letters Product Truth V1 and ACM Product Truth V1 remain complete. Organizations enable or disable shared ProductTemplates for new work on `/admin/products`. Next program selection is pending. Next wave is unauthorized.

See `docs/PRODUCTION_RUNTIME.md` for the production topology. Do not point proof runtimes at a real HUB MEDIA Cloud root.

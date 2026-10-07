# WorkOS PO

WorkOS PO is the canonical WorkOS product repository.

It contains the preserved accepted frontend, the imported API, domain, persistence implementation, and business engine.

The root frontend and its business engine evolve here through Owner-authorized changes.

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

## Current direction

[Request, Catalog and configuration](docs/architecture/REQUEST_CATALOG_CONFIGURATION_CANON.md) is the active flow contract: Catalog administers product definitions; new requests own client/CUI intake and product choice; configuration and offering happen inside the request.

[Roadmap](docs/ROADMAP.md) is the sole living implementation-status source. Accepted historical phases remain recorded there. The current coherence candidate is not merged, deployed or Owner visually accepted. The full product-definition authoring editor remains to be implemented through domain-owned contracts.

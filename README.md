# WorkOS PO

WorkOS PO is the product operating frontend.

This initial repository is a preservation seed of the accepted UI20 frontend. It is not a redesign and not a reconstruction of Pass A.

## Provenance

```text
PRESENTATION_BASE_REPOSITORY = office952/workos-ui20
PRESENTATION_BASE_HEAD = 9446b6d7b2b4e6b7c8ff829de97c1a583c712366

BUSINESS_AUTHORITY_REPOSITORY = office952/workos-final
BUSINESS_AUTHORITY_HEAD_AT_SEED = 084ddebb02950d058554eec01f3dc347790f4ca1

TARGET_REPOSITORY = office952/workos-po
```

- UI20 is now the presentation baseline of WorkOS PO.
- WorkOS Final remains business / API / domain / database authority during this wave.
- Pass A reconstruction is not the frontend source.
- No later UI20 commit was silently included.

See `docs/PROVENANCE.md`.

## Local runtime

This wave keeps the proven frontend-to-Final connection:

```text
frontend 127.0.0.1:5173
/api proxy → 127.0.0.1:8787
contract workos-ui-contract-v1
```

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
pnpm engine:build
```

Isolated engine proof may use `PORT=8788` plus a temporary SQLite path, and `WORKOS_API_PROXY_TARGET=http://127.0.0.1:8788` for a non-default frontend port. The default frontend proxy remains 8787.

Do not run `ports:reclaim` while an Owner reference runtime is already using 5173 / 8787.

## This repository owns

- UI
- UX
- layout
- presentation
- responsive behavior
- accessibility
- interaction states
- presentation models / adapters

## This repository does not own (this wave)

- business formulas
- pricing truth
- ProductDefinition
- Product Truth
- persistence
- database
- quote truth
- order truth
- execution truth
- eligibility rules
- readiness rules

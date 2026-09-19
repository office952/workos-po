# WorkOS UI20 Foundation V1

> HISTORICAL EXECUTION ARTIFACT
> NOT CURRENT PRODUCT AUTHORITY
> CURRENT WORKOS PO SAAS CANON WINS

```text
STATUS = IMPLEMENTED_AWAITING_INDEPENDENT_REVIEW
OWNER_ACCEPTED_FOUNDATION = NO
PHASE_2 = NOT_COMPLETE
DARK_THEME = NOT_IN_SCOPE
```

## Stack

```text
FRAMEWORK = React 19
BUILD_TOOL = Vite 8
LANGUAGE = TypeScript 5.8
TEST = Vitest + Testing Library
STYLING = CSS custom properties
COMPONENT_LIBRARY = NONE
```

Chosen because it is the smallest mainstream SPA stack for TypeScript, component composition, deterministic tests, and same-origin `/api` without SSR or a visual-identity library.

## Runtime

```text
pnpm install
pnpm dev          # http://127.0.0.1:5173 (strictPort)
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Local `/api` is proxied same-origin to `http://127.0.0.1:8787`. The proxy does not change cookie, CSRF, or CORS semantics.

If `GET /api/health` lacks `apiContractId = workos-ui-contract-v1`, the UI fails closed and does not treat the API as supported.

## Structure

```text
src/api/           transport types + HTTP
src/adapters/      health + preview presentation mapping
src/presentation/  generic presentation models
src/fixtures/      synthetic Foundation proof only
src/components/    justified primitives
src/layout/        shell, page header, landmarks
src/surfaces/      Foundation proof surface
src/styles/        tokens + reusable CSS
```

## Transport

```text
CONTRACT_ID = workos-ui-contract-v1
HEALTH = GET /api/health
FAIL_CLOSED = YES
PRODUCTDEFINITION_BROWSER_ROUNDTRIP_REQUIRED = NO
```

Preview / confirm / quote types exist at the boundary. Foundation does not run the first vertical.

## Accessibility and density

- Skip link → `#continut-principal`
- Visible `:focus-visible` (Azure A1, 2px)
- Buttons: visual face ~32px; hit target 44×44
- Text fields: interactive box 44×44
- Skip link: 44×44 when focused, below the 49px shell so it does not cover the brand
- `CONTRACT_ID_IN_SHELL` = FOUNDATION_PROOF_ONLY (not a Phase 3 operator context)
- `#868B94` is not used as body text on light surfaces
- `prefers-reduced-motion` disables motion
- Viewports: 1440 / 1280 / 768
- No global `max-width: 1200px` container

## Figma delta

Foundation 12:6 measured a 49px light `GlobalShellTop` from 1:8520. Implementation follows that protected shell grammar, not FAB.SYS.v4 and not the dark 48px Prototype Pack 95:4 chrome.

The brand mark uses the locked 48px brackets+square geometry from 1:17080, scaled to 20px in chrome. Wordmark in chrome is IBM Plex Sans Bold 18px per 12:6, not Geist 40px.

## Explicit non-scope

No Phase 3 vertical. No Owner Foundation acceptance. No dark theme. No workos-final write.

# WorkOS UI20 API boundary audit V1

> HISTORICAL EXECUTION ARTIFACT
> NOT CURRENT PRODUCT AUTHORITY
> CURRENT WORKOS PO SAAS CANON WINS

```text
STATUS = AUDIT_COMPLETE
IMPLEMENTATION = NOT_STARTED
AUDITED_WORKOS_FINAL_MAIN = 02f9b203c7b657cdd24c83f73fc8180fcf23b314
AUDITED_UI20_BASE = 060af6c1d30557a4ba9841d9ed400e76bce02411
LABEL = HISTORICAL_AUDIT_STATE
NOT_A_PIN = YES
```

The body below is the historical audit at that SHA. Current integrated transport state is recorded in section 16.

This audit determines how `office952/workos-ui20` can consume `office952/workos-final` without copying domain code, duplicating business logic, importing the old UI, sharing the database, or creating hidden frontend calculators.

It does not authorize frontend implementation, new endpoints, CORS changes, or any write to `workos-final`.

## 1. Executive verdict

```text
LABEL = HISTORICAL_AUDIT_STATE
CONFIGURATOR_API_SUFFICIENCY = YES_WITH_SMALL_CONTRACT_GAPS
SEPARATE_ORIGIN_AUTH_COMPATIBILITY = WITH_CHANGES
CORS_STATUS = DEV_ALLOWLIST_ONLY / PRODUCTION_SAME_ORIGIN / UI20_ORIGIN_NOT_LISTED
API_COMPATIBILITY_STRATEGY = HAND_MAINTAINED_TRANSPORT_TYPES + LIVE_MAIN_VERIFICATION + FAIL_CLOSED_ADAPTERS
NEXT_GATE_AT_AUDIT = UI20_TRANSPORT_CONTRACT_GAP_CLOSURE_V1
OWNER_ACCEPTED = NO
```

The first vertical already has real HTTP routes for session, Cerere, template/schema, compile, confirm, EIC/price projection, quote, acceptance, order, production release, job traveler, Atelier inbox, and execution transitions.

That is not the same as a UI20-safe transport boundary.

The current web app does not consume those routes as a separate presentation runtime. It is a same-origin Vite proxy client that also imports `@workos-final/domain` in 64 production files. The configurator compiles locally with `compileDefinition`, decides field visibility with `isFieldVisible` / `selectedComponentIds`, derives commercial stage with `projectCommercialExperience`, and even reads the in-process product registry through `getProductTemplate`.

A clean-sheet UI20 browser can start a LETTERS configuration over HTTP. It cannot honestly render modular field visibility, live readiness, or commercial next-action without either:

1. copying those domain functions (forbidden), or
2. closing small transport gaps in `workos-final` under a later Owner GO.

A separate UI20 origin cannot use the current cookie session as-is. Dev CORS is an explicit localhost allowlist. Production does not enable CORS. Cookies are `SameSite=Lax`. Most commercial fetches omit `credentials: "include"` because the current app assumes same origin.

## 2. Repositories and authority

| Repository | Role | Live main at audit |
| --- | --- | --- |
| `office952/workos-final` | Business engine, API, domain, persistence, current runtime | `02f9b203c7b657cdd24c83f73fc8180fcf23b314` |
| `office952/workos-ui20` | Clean-sheet presentation only | `060af6c1d30557a4ba9841d9ed400e76bce02411` |

Local `workos-final` was on `fix/operational-attention-atelier-hygiene` with a dirty worktree. This audit used GitHub `origin/main` only. `workos-final` remained read-only.

Read and used:

- UI20: `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/SOURCE_OF_TRUTH.md`, `docs/REPOSITORY_BOUNDARY.md`, `docs/FIGMA_AUTHORITY.md`, `docs/ROADMAP.md`
- workos-final: `AGENTS.md`, `docs/roadmap/WORKOS_V1_DELIVERY_ROADMAP.md`, `docs/architecture/WORKOS_UI_UX_DIRECTION_CANON.md`, `docs/architecture/UI_UX_FOUNDATION_CANON.md`, `docs/worklog/WORKOS_UI20_VERTICAL_NORTH_STAR_CLEAN_SHEET_ARCHITECTURE.md`, `docs/architecture/WORKOS_UI20_IMPLEMENTATION_READINESS_CONTRACT.md`, plus current `apps/api` and `apps/web` at the SHA above

```text
BOUNDARY_CONFLICT = NO
ROADMAP_READ = YES
UI_UX_CANON_READ = YES
DIRECTION_CONFLICT = NO
```

UI20 governance and workos-final law agree: UI owns experience; `workos-final` owns Product Truth, pricing, readiness, eligibility, snapshots, and persistence. Current runtime presentation stays in `workos-final` until Owner-approved cutover. No partial production cutover.

## 3. Current frontend / domain coupling

The current frontend is not an HTTP-only presentation layer.

```text
CURRENT_WEB_DIRECT_DOMAIN_IMPORT_COUNT = 64
```

That count is production `apps/web/src` files at live main that import `@workos-final/domain`. Tests add 29 more files.

First-vertical coupling is concentrated in:

- `productApi.ts` — types the HTTP JSON as domain objects
- `ProductConfigurationPage.tsx` — orchestrates compile/confirm/quote/order/release/execution and calls `projectCommercialExperience`
- `configurator/configuratorView.ts` — **runs `compileDefinition` in the browser**
- `FormRenderer.tsx` — runs `isFieldVisible` and `selectedComponentIds`
- `ProductConfigurationViews.tsx` — labels commercial actions and calls `getProductTemplate`
- `requestsApi.ts`, `quotesApi.ts`, `jobsApi.ts`, `customerApi.ts`, `atelierApi.ts`, `operatorSessionApi.ts`

See `docs/UI20_DEPENDENCY_MAP_V1.md`.

Required UI20 replacement:

```text
WORKOS FINAL API
→ typed transport contract
→ UI20 adapter
→ presentation model
→ UI
```

Forbidden replacement:

```text
npm install @workos-final/domain
```

or any copy of `packages/domain`.

## 4. Existing HTTP API sufficiency

The first vertical is implemented as Hono routes under `/api/*`. There is no OpenAPI document and no `/api/version` contract identity. Snapshot objects carry internal `schemaVersion`. That versions frozen records, not the HTTP surface.

First-vertical capabilities that already exist as real routes:

| Capability | Existing? | Sufficiency |
| --- | --- | --- |
| Cloud session / login / logout / active organization | YES | Origin/cookie change required for a separate UI20 host |
| Operator PIN session and Atelier inbox | YES | Cookie + credentials |
| Cerere list / create / detail / patch / attachments / quote link | YES | Adapter over projections |
| Customer list / create / read / workspace | YES | Adapter |
| Template + form schema | YES | Overexposes `ProductTemplate` |
| Compile | YES | Returns full `ProductDefinition` |
| Confirm + EIC + commercial price + installation + execution preview | YES | Request still requires the reviewed definition object |
| Quote freeze / read / PDF / accept | YES | Adapter; financial fields scoped server-side |
| Order freeze / read | YES | Adapter |
| Production release create / read | YES | Adapter |
| Job overview / job traveler | YES | Stronger projection than most product routes |
| Execution plan create / read | YES | Returns `ExecutionPlanView` |
| Task provider / executor / start / complete | YES | Server owns eligibility and transitions |

Missing as a first-vertical HTTP contract:

- values-dependent visible-field + readiness preview (the current UI compiles locally)
- confirm / quote freeze that accepts only `reviewId` + draft values, without resubmitting `ProductDefinition`
- commercial-experience / next-action projection on confirm
- API contract identity for cross-repo compatibility
- UI20 origin on the CORS allowlist

Detailed rows: `docs/API_CONTRACT_MATRIX_V1.md`.

## 5. Authentication / session boundary

Two sessions exist.

**Account / Cloud session**

- Cookie: `workos_cloud_session`
- HttpOnly, path `/`, `SameSite=Lax`, `Secure` only when `NODE_ENV === "production"`
- TTL 12 hours
- Routes: `GET /api/cloud/session`, `POST /api/cloud/login`, `POST /api/cloud/logout`, `POST /api/cloud/active-organization`
- Cloud mode middleware `requireCloudSession()` protects all `/api/*` except health, login, session, logout
- Organization is selected on the session. The API opens that organization's operational plane. UI20 must not invent a second org scope.

**Operator session**

- Cookie: `workos_operator_session`
- HttpOnly, path `/`, `SameSite=Lax`, **no `Secure` flag in current code**
- TTL 12 hours
- PIN identify: `POST /api/operator-session`
- Inbox: `GET /api/operator-task-inbox`
- Start / complete require this cookie
- Distinct from Cloud account session. Logout of Cloud also clears the operator cookie.

**CORS and origin**

Dev only (`NODE_ENV !== "production"`):

```text
http://127.0.0.1:5173
http://localhost:5173
http://127.0.0.1:5178
http://127.0.0.1:5185
http://127.0.0.1:5187
```

Credentials are allowed. There is no `*` origin. Production does not register CORS, so the current runtime assumes the web and API share a host or a same-origin proxy.

The current web Vite config proxies `/api` to `127.0.0.1:8787`. That hides the origin problem.

`VITE_API_BASE_URL` exists, but `requestsApi.ts`, `customerApi.ts`, and most `productApi.ts` calls do not send `credentials: "include"`. Those calls work today only because the browser treats the proxied `/api` path as same-origin.

**CSRF**

No CSRF token exists. Current protection is cookie HttpOnly + `SameSite=Lax` + same-site posting. A UI20 origin on another registrable domain is cross-site. `SameSite=Lax` will not send the cookie on cross-site POSTs.

```text
CAN_SEPARATE_UI20_ORIGIN_USE_CURRENT_AUTH_API = WITH_CHANGES
```

Required later Owner-authorized `workos-final` changes, not this GO:

1. Add the exact UI20 origin to a non-wildcard CORS allowlist.
2. Decide cookie policy for that origin (`SameSite=None; Secure` only if truly cross-site, plus CSRF or an equivalent).
3. Keep Cloud and operator cookies HttpOnly.
4. Make credentialed fetch the default for authenticated routes.
5. Do not add `*` CORS.
6. Do not add an auth bypass.

Local same-host proxy remains an allowed development topology. It is not a production cutover plan.

## 6. Configurator boundary

Answer:

```text
YES_WITH_SMALL_CONTRACT_GAPS
```

A separate browser can:

1. `GET /api/products/:productCode` → template + `formSchema`
2. POST draft values to `/compile` → `ProductDefinition` + `reviewId`
3. POST that reviewed definition to `/confirm` → `truth`, `aggregate`, scoped `eic`, `commercialPrice`, optional installation, `executionPlanPreview`
4. Continue into quote / acceptance / order / release / execution over existing routes

It cannot, without copying domain code:

1. Know which fields are visible after each keystroke. Visibility is `isFieldVisible(field, values, selectedComponentIds(template, values))`. No HTTP preview returns the visible subset.
2. Know modular completeness without running `compileDefinition` or calling `/compile` on every change. The current page does both: local compile for the workspace, HTTP compile for the review object.
3. Know commercial next action without `projectCommercialExperience`.
4. Know LETTERS fixed values without `getProductTemplate(truth.templateCode)` from the domain registry.

Confirm is also unsafe as a long-term transport: the client must store and resubmit a domain `ProductDefinition`. The server re-validates `reviewId`, which is correct ownership, but the payload is an internal domain object, not a stable DTO.

LETTERS none/none remains the regression product. ACM uses the same routes. Unselected modules must stay silent. That silence is currently enforced by domain visibility functions in the browser.

## 7. Commercial boundary

Server owns:

- `projectCommercialPrice`
- `freezeQuoteSnapshot`
- `recordQuoteAcceptance`
- `freezeOrderSnapshot`
- seller completeness
- customer ACTIVE check
- request/customer match
- financial field scoping (`financialAccess` / `scopeQuoteSnapshot` / `scopeEic`)
- quote PDF bytes from the frozen snapshot

The current confirm response already returns scoped `eic` and `commercialPrice`. Quote freeze is `POST /api/products/:productCode/quote-snapshots` with `{ definition, reviewId, customerId, requestId? }`.

UI20 must not reprice, recompute VAT/markup, or decide COMPLETE vs PARTIAL. Those values arrive from the API.

Gaps:

- commercial experience / primary action is derived in the page, not returned
- quote/order JSON is a scoped domain snapshot, not a dedicated operator DTO
- `GET /api/seller` is required before freeze; the UI should consume seller readiness from the API, not from `OWNER_CONFIRMED_SELLER`

Installation / operational service remains optional and organization-scoped. Selected installation currently blocks product quote freeze (`SERVICE_QUOTE_FREEZE_NOT_AUTHORIZED`). UI20 must display that refusal. It must not invent a product-priced montaj path.

## 8. Production / execution boundary

Server owns snapshot freeze, order-release readiness, plan materialization, provider/executor eligibility, claim-on-start, complete, actuals, and inventory OUT.

Useful operator projections already exist:

- `GET /api/jobs` and `GET /api/jobs/:jobId`
- `GET /api/operator-task-inbox`
- `GET /api/execution-plans/:planId` → `ExecutionPlanView`
- task mutation responses return the updated plan view and typed errors

UI20 must render `eligibleProviders`, `eligibleExecutors`, `operatorRelation`, and error codes. It must not recompute them.

Provider / executor assignment routes are owner-gated in Cloud. Start / complete require operator session, not owner role.

## 9. Business logic leakage findings

Do not fix these here. Do not copy them into UI20.

| File / symbol | Classification | Why |
| --- | --- | --- |
| `configurator/configuratorView.ts` `compileDefinition` | FRONTEND_BUSINESS_LOGIC_DEBT | Browser compiles ProductDefinition / readiness |
| `configurator/configuratorView.ts` `isFieldVisible` | FRONTEND_BUSINESS_LOGIC_DEBT | Modular visibility is product law |
| `configurator/configuratorView.ts` `selectedComponentIds` | FRONTEND_BUSINESS_LOGIC_DEBT | Selected-module set is product law |
| `FormRenderer.tsx` `isFieldVisible` / `selectedComponentIds` | FRONTEND_BUSINESS_LOGIC_DEBT | Same visibility law in the form |
| `ProductConfigurationPage.tsx` `projectCommercialExperience` | FRONTEND_BUSINESS_LOGIC_DEBT | Commercial stage / next action |
| `ProductConfigurationPage.tsx` `siteInstallationIsPrequoteReady` | FRONTEND_BUSINESS_LOGIC_DEBT | Installation readiness |
| `ProductConfigurationViews.tsx` `getProductTemplate` | FRONTEND_BUSINESS_LOGIC_DEBT | In-process ProductTemplate registry |
| `ProductConfigurationViews.tsx` `commercialPrimaryActionLabel` / `commercialCompletenessLabel` | FRONTEND_BUSINESS_LOGIC_DEBT | Action identity belongs with commercial projection |
| `RequestDetailPage.tsx` / `requestObjectView.ts` `siteInstallationIsPrequoteReady` | FRONTEND_BUSINESS_LOGIC_DEBT | Same readiness helper |
| `requestsRegistryView.ts` `filterRequestOverview` | FRONTEND_PRESENTATION_ONLY | Filters an already projected list |
| `ClientLink.tsx` `customerHref` | FRONTEND_PRESENTATION_ONLY | Route helper |
| `JobDetailPage.tsx` `jobConfiguratorHref` | FRONTEND_PRESENTATION_ONLY | Route helper |
| `formatDisplay.ts` | FRONTEND_PRESENTATION_ONLY | Locale formatting only |
| Execution / Atelier error switches | FRONTEND_PRESENTATION_ONLY | Maps server error codes to Romanian copy |
| `organizationAccess.ts` / `visibleNavigation.ts` | FRONTEND_PRESENTATION_ONLY | Local nav hide from Cloud role; API still enforces owner writes |
| Admin `project*` imports in tests / `ownerCatalog.ts` | FRONTEND_BUSINESS_LOGIC_DEBT | Outside first vertical; do not copy |

```text
FRONTEND_BUSINESS_LOGIC_DEBT_COUNT = 9
```

Count is first-vertical production debts in the table above, excluding presentation-only helpers and admin-only debt.

Pricing, EIC, quote/order freeze, task eligibility, and snapshot immutability are already server/domain owned. The leak is that the current UI still re-runs some of that law for presentation.

## 10. Cross-repository compatibility strategy

Evaluated:

1. Unversioned current API — this is what exists
2. Explicit `/v1` prefix — not present; do not invent it in this GO
3. OpenAPI / generated schema — not present
4. Hand-maintained transport typings — current web types are domain types, not transport types
5. Runtime capability/version endpoint — only `GET /api/health` `{ status, service: "workos-final-api" }`

```text
API_COMPATIBILITY_STRATEGY = HAND_MAINTAINED_TRANSPORT_TYPES + LIVE_MAIN_VERIFICATION + FAIL_CLOSED_ADAPTERS
```

**Why.** Two repositories now exist. The smallest safe mechanism is typed HTTP JSON owned by UI20 adapters, verified against live `workos-final` main, failing closed on unknown shapes. A generated OpenAPI stack or a versioned public API would be new infrastructure without a current artifact to generate from.

**Current support.** Unversioned JSON. Financial scoping. Snapshot `schemaVersion`. Health service name.

**Missing pieces.** Contract identity on health or a dedicated read. Draft-preview DTO. Definition-free confirm. Origin/CORS/cookie policy for UI20. Credentialed clients.

**V1 minimum**

1. UI20 must not depend on `@workos-final/domain`.
2. UI20 hand-maintains transport types that describe HTTP JSON only.
3. Every adapter fail-closes on missing required fields.
4. Before any UI20 integration claim, verify live `office952/workos-final` `main`. Do not pin development to `02f9b203…`.
5. A later Owner GO may add a small `apiContractId` to `/api/health`. That is enough. Do not create `/v2` now.

## 11. Contract gaps

Must close in `workos-final` before a honest isolated configurator. Not authorized by this GO.

| Gap | Class | Why it blocks UI20 |
| --- | --- | --- |
| Draft preview (visible fields, selected modules, readiness, missing labels) | MISSING_TRANSPORT_CONTRACT | Otherwise UI20 copies `compileDefinition` / `isFieldVisible` |
| Confirm / quote from `reviewId` + values, not `ProductDefinition` | OVEREXPOSED_INTERNAL_DOMAIN | Client should not hold the internal definition graph |
| Commercial experience on confirm / quote read | UNDEREXPOSED_FOR_UI20 | Otherwise UI20 copies `projectCommercialExperience` |
| Template transport DTO instead of raw `ProductTemplate` | OVEREXPOSED_INTERNAL_DOMAIN | Current GET is domain serialization |
| UI20 origin + credentialed cookie policy | AUTH / CORS | Separate repository/runtime cannot login otherwise |
| `apiContractId` on health | MISSING_TRANSPORT_CONTRACT | Silent cross-repo breakage |
| Consistent `credentials: "include"` | CLIENT GAP | Current clients assume Vite proxy |

Do not treat these as existing endpoints.

## 12. Security considerations

- Do not weaken auth for convenience.
- Do not implement permissive `*` CORS.
- Do not create an auth bypass.
- Cloud and operator cookies must stay HttpOnly.
- Operator cookie currently lacks `Secure` in production. Record only; do not “fix” it from UI20.
- Financial fields are already scoped by role. UI20 must not ask the API to return owner-only cost to a member and then hide it.
- `/api/dev/operator-session` is fail-closed unless non-production + `WORKOS_DEV_OPERATOR_BYPASS=1`. UI20 must not call it in any accepted runtime.
- Quote PDF and attachment download are authenticated cookie routes, not public files.

## 13. Smart modularity

The HTTP boundary is organization-plane scoped, not HUB MEDIA-specific. Product templates, optional request scopes, and frozen snapshots are generic.

```text
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
NO_CLIENT_CODE_FORK = YES
OPTIONAL_MODULES_SUPPORTED_BY_BOUNDARY = CONDITIONAL
HISTORICAL_SNAPSHOT_SAFETY = YES
```

Optional modules are supported only if visibility and silence stay server-owned. Today that law leaks into the browser. Historical quotes, acceptances, orders, and releases are immutable server snapshots. UI20 must read them, not recompile them after later configuration changes.

Works for advanced production organizations and small/manual ones because Cloud membership + operator PIN are optional layers over the same routes. Single-plane local runtime has no Cloud session requirement.

## 14. Recommended implementation boundary

UI20 may later own:

- Figma-driven shell, foundation, navigation chrome
- presentation models
- HTTP adapters
- Romanian operator copy
- interaction / responsive / accessibility

UI20 may not own:

- `packages/domain`
- compile / confirm / price / EIC / readiness / eligibility engines
- SQLite / migrations / seeds
- cookie issuance
- old `apps/web` pages or CSS as a visual base

Current `apps/web` API modules are **behavioral evidence** for route names and payloads. They are not authorized source copies. Current React pages and CSS are **replace presentation**.

Until transport gaps close, UI20 must not implement Configurator against the current definition object.

## 15. Exact next gate

```text
LABEL = HISTORICAL_AUDIT_STATE
NEXT_GATE_AT_AUDIT = UI20_TRANSPORT_CONTRACT_GAP_CLOSURE_V1
```

Evidence: the first vertical has routes, but isolated UI20 cannot consume Configurator + separate-origin auth without new `workos-final` transport/auth work. Foundation scaffolding now would recreate the current domain-import trap.

That next gate is **not** started by this audit. It requires an explicit Owner GO and, for API/CORS/cookie changes, `WORKOS_FINAL_WRITE`.

Do not start `UI20_FRONTEND_FOUNDATION_BOOTSTRAP_V1` until the Owner accepts either:

1. gap closure first, or
2. a foundation-only visual bootstrap that talks to no business API except health.

## 16. Current integrated transport state

This section is documentation sync only. It does not start Phase 2 and does not rewrite the historical audit body above.

```text
LABEL = CURRENT_INTEGRATED_STATE
TRANSPORT_CONTRACT_GAP_CLOSURE_V1 = INTEGRATED_ON_WORKOS_FINAL_MAIN
TRANSPORT_CONTRACT_ID = workos-ui-contract-v1
WORKOS_FINAL_INTEGRATED_MAIN = 1f409ab728668d2daace37273055177075fecd7c
PR33 = MERGED
CONFIGURATION_PREVIEW_ENDPOINT = POST /api/products/:productCode/preview
CONFIRM_SAFE_CONTRACT = values + crv1 reviewId
QUOTE_FREEZE_SAFE_CONTRACT = values + crv1 reviewId + customerId
PRODUCTDEFINITION_BROWSER_ROUNDTRIP_REQUIRED = NO
CORS_CHANGED = NO
COOKIE_POLICY_CHANGED = NO
CSRF_CHANGED = NO
AUTH_BYPASS = NO
PHASE_2 = IMPLEMENTED_AWAITING_REVIEW
NEXT_GATE = CHATGPT_INDEPENDENT_REVIEW
NEXT_GATE_STARTED = NO
OWNER_ACCEPTED_FOUNDATION = NO
```

Preferred production topology remains same-origin. Isolated UI20 must fail closed if `GET /api/health` does not return `apiContractId = workos-ui-contract-v1`.

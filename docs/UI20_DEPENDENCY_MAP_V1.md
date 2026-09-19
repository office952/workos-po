# WorkOS UI20 dependency map V1

```text
AUDITED_WORKOS_FINAL_MAIN = 02f9b203c7b657cdd24c83f73fc8180fcf23b314
CURRENT_WEB_DIRECT_DOMAIN_IMPORT_COUNT = 64
LABEL = HISTORICAL_AUDIT_OF_CURRENT_WEB_COUPLING
TRANSPORT_CONTRACT_STATUS = INTEGRATED_ON_WORKOS_FINAL_MAIN
WORKOS_FINAL_TRANSPORT_MAIN = 1f409ab728668d2daace37273055177075fecd7c
```

The table below remains the historical map of current-web domain coupling. Isolated UI20 must consume the main-integrated preview / values+`crv1` confirm / quote contracts instead of copying those helpers.

Map: current frontend dependency → business owner → HTTP contract → UI20 replacement.

A useful current file is **not** a copy license.

```text
CONCEPT / CONTRACT REUSE = YES
SOURCE-CODE COPY = NO BY DEFAULT
```

---

## Direct `@workos-final/domain` imports — first vertical

| Current dependency | Imported symbols | Symbol owner | Purpose | Business or presentation | Current API equivalent | UI20 needs it | Safe over HTTP | Gap | UI20 replacement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `productApi.ts` | `ProductTemplate`, `FormSchema`, `DraftValues`, `ProductDefinition`, `ProductTruth`, `ProductAggregate`, `EicResult`, `CommercialPriceProjection`, snapshots, `ExecutionPlanView` | domain | Type HTTP JSON as domain | Business truth types | All product/commercial/execution routes | Need shapes, not package | JSON yes; package no | Types are domain, not DTO | Hand-maintained transport types |
| `ProductConfigurationPage.tsx` | `projectCommercialExperience`, snapshot types, `siteInstallationIsPrequoteReady` | domain | Orchestrate vertical + derive commercial stage | Business | confirm / quote now include `commercialExperience` and installation readiness on main | Stage labels | Yes via confirm/quote | HISTORICAL: experience not on confirm at audit SHA | Use server `commercialExperience` / installation projection |
| `configurator/configuratorView.ts` | `compileDefinition`, `isFieldVisible`, `selectedComponentIds`, template/schema types | domain | Live completeness and visibility | Business | `POST .../preview` on workos-final main | Visibility + readiness | No if copied | HISTORICAL: no preview DTO at audit SHA | HTTP preview → presentation model |
| `FormRenderer.tsx` | `isFieldVisible`, `selectedComponentIds`, `FormField`, `FormSchema` | domain | Show/hide fields | Business | none values-dependent | YES | No | Visibility law in browser | Render only API-visible fields |
| `configurator/ConfiguratorWorkspace.tsx` | draft/schema/template **types only** | domain | Workspace props | Presentation types | template GET | Types | Types only | | Transport field list |
| `ProductConfigurationViews.tsx` | `getProductTemplate`, commercial labels, EIC types, snapshot types, installation helpers | domain | Confirmed / quote / EIC panels | Mixed | confirm + quote reads | Display facts | `getProductTemplate` no | Registry lookup | Use template from GET; labels from API |
| `requestsApi.ts` | request / detail / overview types | domain | Cerere client | Business types | `/api/requests*` | YES | JSON | credentials omitted | Transport types + credentials |
| `RequestDetailPage.tsx` | request types, `siteInstallationIsPrequoteReady` | domain | Cerere object | Mixed | request detail | Display | Readiness helper no | Readiness in UI | Use detail.installationScope flags from API or add flag |
| `RequestInstallationFactsForm.tsx` | installation fact types | domain | Facts form | Business types | installation-facts PATCH | YES | JSON | | Adapter |
| `RequestsOverviewPage.tsx` | overview types | domain | Cerere list | Types | `GET /api/requests` | YES | JSON | | Adapter |
| `requestsRegistryView.ts` | `filterRequestOverview` | domain | Search/filter projected list | Presentation | none | Optional | Yes if local filter only | | Reimplement filter on overview DTO |
| `quotesApi.ts` | `QuoteOverviewProjection` | domain | Ofertă registry | Types | `/api/quotes` | YES | JSON | | Adapter |
| `QuotesOverviewPage.tsx` / `QuoteInspectionPage.tsx` | overview types, `formatCustomerMoneyAmount` | domain | Ofertă surfaces | Mixed | quotes + product quote reads | Display | Format yes | | Locale format in UI20; no domain money policy |
| `jobsApi.ts` | `JobOverviewProjection` | domain | Lucrări | Types | `/api/jobs` | YES | JSON | | Adapter |
| `JobsOverviewPage.tsx` / `JobDetailPage.tsx` | overview types, `jobConfiguratorHref`, `formatCustomerMoneyAmount` | domain | Job list/traveler | Mixed | `/api/jobs/:jobId` | YES | Href is presentation | | UI20 routes; traveler from job API |
| `customerApi.ts` | `Customer`, registry, workspace types | domain | Client lookup | Types | `/api/customers*` | YES | JSON | | Adapter |
| `ClientsOverviewPage.tsx` / `ClientWorkspacePage.tsx` / `ClientLink.tsx` | registry/workspace types, `customerHref` | domain | Clienți | Mixed | customer workspace | YES | Href presentation | | UI20 routes |
| `atelierApi.ts` | `OperatorTaskInboxProjection` | domain | Atelier inbox | Types | `/api/operator-task-inbox` | YES | JSON | | Adapter |
| `AtelierPage.tsx` | inbox item types | domain | Inbox UI | Types | inbox GET | YES | JSON | | Presentation from inbox DTO |
| `operatorSessionApi.ts` | `OperatorCandidate` type | domain | PIN identify | Types | operator session routes | YES | JSON | | Adapter |
| `OperatorIdentifyForm.tsx` | `OperatorCandidate` type | domain | Identify form | Types | candidates GET | YES | JSON | | Adapter |
| `ExecutionWorkspacePage.tsx` / `ExecutionPlanPanel.tsx` / `PlannedVersusActual.tsx` / `pvaProjection.ts` | `ExecutionPlanView` | domain | Execuție | Types + local layout of planned/actual | plan GET + task POSTs | YES | View is already a projection | | Adapter; do not copy eligibility |
| `StatePill.tsx` | status unions | domain | Status chrome | Presentation of server enums | carried on projections | Optional | Yes | | UI20 status mapping from DTO enums |
| `installationPresentation.ts` | installation types | domain | Href/helpers | Mixed | request/confirm installation | Optional | | | Presentation only |
| `sellerApi.ts` | `SellerProfile` | domain | Date firmă | Types | `GET /api/seller` | YES for freeze | JSON | | Adapter |
| `requestObjectView.ts` | `siteInstallationIsPrequoteReady` | domain | Object strip readiness | Business | request detail | Display | No | | Server flag |

---

## Direct domain imports — not first vertical (do not copy)

Admin / inspection files that import `@workos-final/domain` at the audited SHA:

`ComponentsPage.tsx`, `CostEvidenceEditor.tsx`, `CustomerAdminPage.tsx`, `CustomerProfileFields.tsx`, `GovernancePage.tsx`, `OperationalServicesAdminPage.tsx`, `PeopleAdminPage.tsx`, `PersonAdminPage.tsx`, `ProcessesAdminPage.tsx`, `ProductSystemAdminPage.tsx`, `ResourcesAdminPage.tsx`, `SellerAdminPage.tsx`, `SkillsAdminPage.tsx`, `StockAdminPage.tsx`, `WorkcentersAdminPage.tsx`, `CatalogTree.tsx`, `catalogProducts.ts`, `ownerCatalog.ts`, `peopleApi.ts`, `processesCatalog.ts`, `resourcesCatalog.ts`, `resourcesWorkspace.ts`, `inventoryApi.ts`, `operationalServicesApi.ts`, `systemApi.ts`, `workcentersCatalog.ts`, `clientWorkspaceView.ts`, `clientsRegistryView.ts`, `useClientsRegistryState.ts`, `useRequestsRegistryState.ts`.

Several **value** imports here are projectors (`projectOperationalProcessesAdministration`, `projectInventoryStock`, `productionCapabilityClasses`, `OWNER_CONFIRMED_SELLER`). Those are domain authority. UI20 must not copy them. If Administrare is ever in scope, consume the existing admin GET routes.

---

## Non-domain current modules

| Current file | Classification | UI20 strategy |
| --- | --- | --- |
| `productApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Reimplement as UI20 adapter after transport types exist |
| `requestsApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same |
| `quotesApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same |
| `jobsApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same |
| `atelierApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same |
| `customerApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same |
| `cloudSessionApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same; credentialed |
| `operatorSessionApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same; credentialed |
| `sellerApi.ts` | KEEP AS BEHAVIORAL REFERENCE | Same |
| `fetchAccess.ts` / `sessionExpiryBridge.ts` / `cloudAuth.ts` | KEEP AS BEHAVIORAL REFERENCE | Reimplement expiry/login copy; do not copy storage keys blindly |
| `formatDisplay.ts` | KEEP AS NON-VISUAL ALGORITHM | Locale formatting may be reimplemented; do not copy money policy |
| `organizationAccess.ts` / `visibleNavigation.ts` | KEEP AS BEHAVIORAL REFERENCE | Nav chrome is UI20-owned; API still enforces writes |
| `configuratorPresentation.ts` | REPLACE PRESENTATION | Figma foundation owns visual labels |
| Old React pages (`*Page.tsx`) | REPLACE PRESENTATION | Behavioral evidence only |
| Old CSS / `ui/*` | REPLACE PRESENTATION | Do not copy as visual base |
| Old shared components | REPLACE PRESENTATION | Rebuild from WorkOs-F |
| `packages/domain` | DO NOT COPY | Business engine |
| `apps/api` | DO NOT COPY | Business engine |
| SQLite files / migrations | DO NOT COPY | Persistence authority |

---

## Auth / navigation / permissions

| Current dependency | Owner | HTTP | UI20 strategy |
| --- | --- | --- | --- |
| Cloud cookie session | API / control plane | `/api/cloud/*` | Consume; do not reissue cookies |
| Operator cookie session | API / people | `/api/operator-session*` | Consume |
| `canAdministerOrganization` | presentation of Cloud role | session snapshot `role` | Hide owner chrome; API remains authority |
| `NAVIGATION_DESTINATIONS` | current web IA | none | Rebuild from accepted Figma IA; do not copy V3 sidebar as required base |
| Vite `/api` proxy | current local topology | n/a | Allowed as a later local harness; not a cutover |

---

## Replacement law

```text
CURRENT FRONTEND DEPENDENCY
→ BUSINESS OWNER = office952/workos-final
→ HTTP CONTRACT = existing /api route or documented gap
→ UI20 REPLACEMENT = adapter + presentation model
→ NEVER = domain package, old page tree, hidden calculator
```

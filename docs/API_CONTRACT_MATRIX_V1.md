# WorkOS UI20 API contract matrix V1

> HISTORICAL EXECUTION ARTIFACT
> NOT CURRENT PRODUCT AUTHORITY
> CURRENT WORKOS PO SAAS CANON WINS

```text
AUDITED_WORKOS_FINAL_MAIN = 02f9b203c7b657cdd24c83f73fc8180fcf23b314
KIND = CURRENT unless Status says PROPOSED
NO_SPECULATIVE_CURRENT_ROUTES = YES
TRANSPORT_CONTRACT_ID = workos-ui-contract-v1
TRANSPORT_CONTRACT_STATUS = INTEGRATED_ON_WORKOS_FINAL_MAIN
WORKOS_FINAL_TRANSPORT_MAIN = 1f409ab728668d2daace37273055177075fecd7c
PR33 = MERGED
CORS_CHANGED = NO
PRODUCTDEFINITION_BROWSER_ROUNDTRIP_REQUIRED = NO
```

Request and response types below are the shapes the current API actually serializes. They are mostly domain objects, not dedicated transport DTOs. UI20 must treat them as observed JSON, not as a license to import `@workos-final/domain`.

Auth column:

- `public` = listed in Cloud `PUBLIC_PATHS` or health
- `cloud` = Cloud session required when API is in cloud mode; open in single-plane
- `cloud+owner` = Cloud owner role when in cloud mode
- `operator` = operator cookie required for success (route may still be reachable)

Organization scope: Cloud mode binds the operational plane from the active organization on the session. Single-plane has one local runtime.

---

## CURRENT — first vertical

| Status | Domain | Operation | Method | Route | Request type | Response type | Auth | Current client | First vertical use | Classification | Gap | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CURRENT | AUTH | Health | GET | `/api/health` | none | `{ status, service, apiContractId }` | public | `health.ts` | YES | READY_FOR_UI20 | `apiContractId = workos-ui-contract-v1` on workos-final main | Fail closed if identity missing |
| CURRENT | AUTH | Read Cloud session | GET | `/api/cloud/session` | none | session snapshot or empty user | public | `cloudSessionApi.ts` | YES | READY_WITH_ADAPTER | Cookie / CORS for other origin | Adapter + origin GO |
| CURRENT | AUTH | Cloud login | POST | `/api/cloud/login` | `{ email, password, organizationId? }` | session or `organization_selection_required` | public | `cloudSessionApi.ts` | YES | READY_WITH_ADAPTER | Set-cookie SameSite=Lax | Origin/cookie GO |
| CURRENT | AUTH | Cloud logout | POST | `/api/cloud/logout` | none | `{ ok: true }` | public | `cloudSessionApi.ts` | YES | READY_FOR_UI20 | Clears Cloud + operator cookies | Adapter |
| CURRENT | AUTH | Switch organization | POST | `/api/cloud/active-organization` | `{ organizationId }` | session snapshot | cloud | `cloudSessionApi.ts` | YES | READY_WITH_ADAPTER | Clears operator session | Adapter |
| CURRENT | AUTH | List operator candidates | GET | `/api/operator-candidates` | none | `{ candidates }` | cloud | `operatorSessionApi.ts` | YES | READY_FOR_UI20 | | Adapter types only |
| CURRENT | AUTH | Read operator session | GET | `/api/operator-session` | none | `{ operator, session }` or nulls | cloud | `operatorSessionApi.ts` | YES | READY_FOR_UI20 | | Adapter |
| CURRENT | AUTH | Identify operator | POST | `/api/operator-session` | `{ personId, pin }` | operator + session; Set-cookie | cloud | `operatorSessionApi.ts` | YES | READY_WITH_ADAPTER | Operator cookie has no Secure | Origin/cookie GO |
| CURRENT | AUTH | Logout operator | DELETE | `/api/operator-session` | none | `{ ok: true }` | cloud | `operatorSessionApi.ts` | YES | READY_FOR_UI20 | | Adapter |
| CURRENT | AUTH | Dev operator bypass | POST | `/api/dev/operator-session` | none | session or 404 | fail-closed | none required | NO | UNKNOWN for accepted runtime | Dev only | Do not call from UI20 accepted path |
| CURRENT | ATELIER | Operator inbox | GET | `/api/operator-task-inbox` | none | `{ operator, inbox }` or nulls | cloud; useful with operator | `atelierApi.ts` | YES | READY_FOR_UI20 | Financial fields omitted | Adapter |
| CURRENT | CERERE | List requests | GET | `/api/requests` | none | `{ overview }` | cloud | `requestsApi.ts` | YES | READY_FOR_UI20 | Fetch omits credentials | Credentialed client |
| CURRENT | CERERE | Create request | POST | `/api/requests` | `{ customerId, title, description }` | `{ request, detail }` | cloud | `requestsApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | CERERE | Read request | GET | `/api/requests/:requestId` | none | `{ detail }` scoped | cloud | `requestsApi.ts` | YES | READY_FOR_UI20 | | Adapter |
| CURRENT | CERERE | Patch request | PATCH | `/api/requests/:requestId` | title/description/status/customer/optionalScopeIds/mode | `{ alreadyApplied, request, detail }` | cloud | `requestsApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | CERERE | Patch installation facts | PATCH | `/api/requests/:requestId/installation-facts` | facts + `expectedVersion` | `{ alreadyApplied, facts, detail }` | cloud | `requestsApi.ts` | YES | READY_WITH_ADAPTER | Versioned write | Adapter; do not invent facts |
| CURRENT | CERERE | Patch installation price | PATCH | `/api/requests/:requestId/installation-price` | `{ manualNetPrice }` | `{ alreadyApplied, request, detail }` | cloud+owner | `requestsApi.ts` | OPTIONAL | READY_WITH_ADAPTER | Owner-only money write | Do not expose to members |
| CURRENT | CERERE | Link quote | POST | `/api/requests/:requestId/quotes` | `{ quoteSnapshotId }` | `{ alreadyApplied, link, detail }` | cloud | `requestsApi.ts` | YES | READY_WITH_ADAPTER | Also happens during quote freeze | Adapter |
| CURRENT | CERERE | List attachments | GET | `/api/requests/:requestId/attachments` | none | `{ attachments }` | cloud | `requestsApi.ts` | YES | READY_FOR_UI20 | | Adapter |
| CURRENT | CERERE | Upload attachment | POST | `/api/requests/:requestId/attachments` | multipart `file` | `{ attachment, detail }` | cloud | `requestsApi.ts` | YES | READY_FOR_UI20 | Size limit server-owned | Adapter |
| CURRENT | CERERE | Download attachment | GET | `/api/requests/:requestId/attachments/:attachmentId/download` | none | file bytes | cloud | `requestsApi.ts` | YES | READY_FOR_UI20 | Cookie download | Same-origin or credentialed |
| CURRENT | CUSTOMER | List / registry | GET | `/api/customers` | none | `{ customers, registry }` | cloud | `customerApi.ts` | YES | READY_WITH_ADAPTER | Fetch omits credentials | Adapter |
| CURRENT | CUSTOMER | Read customer | GET | `/api/customers/:customerId` | none | `{ customer }` | cloud | `customerApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | CUSTOMER | Customer workspace | GET | `/api/customers/:customerId/workspace` | none | `{ workspace }` | cloud | `customerApi.ts` | YES | READY_FOR_UI20 | Projection | Adapter |
| CURRENT | CUSTOMER | Create customer | POST | `/api/customers` | `{ displayName, profile? }` | `{ customer, customers }` | cloud | `customerApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | CUSTOMER | Patch / retire | PATCH | `/api/customers/:customerId` | profile or `{ status: "RETIRED" }` | `{ alreadyApplied, customer, customers }` | cloud | `customerApi.ts` | OPTIONAL | READY_WITH_ADAPTER | | Adapter |
| CURRENT | SELLER | Read seller | GET | `/api/seller` | none | seller profile | cloud | `sellerApi.ts` | YES | READY_WITH_ADAPTER | Required before quote freeze | Adapter |
| CURRENT | CONFIGURATOR | Product catalog | GET | `/api/product-catalog` | none | `{ tree }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | `CatalogTreeNode` domain shape | Adapter |
| CURRENT | CONFIGURATOR | Template + schema | GET | `/api/products/:productCode` | none | `{ template, formSchema }` | cloud | `productApi.ts` | YES | OVEREXPOSED_INTERNAL_DOMAIN | Raw `ProductTemplate` | Transport DTO later |
| CURRENT | CONFIGURATOR | Process composition | GET | `/api/products/:productCode/process-composition` | query `faceFinish`, `volumeFinish` | `{ composition, inspections }` | cloud | none first-vertical required | OPTIONAL | OVEREXPOSED_INTERNAL_DOMAIN | Financial fields omitted | Do not copy composition engine |
| CURRENT | CONFIGURATOR | Preview | POST | `/api/products/:productCode/preview` | `{ values, requestId? }` | product identity, visible schema, selected modules, readiness, missing, `crv1` reviewId, installation | cloud | none yet | YES | READY_FOR_UI20 | Integrated on workos-final main; no ProductDefinition | Adapter only |
| CURRENT | CONFIGURATOR | Compile | POST | `/api/products/:productCode/compile` | `{ values }` | `{ definition, reviewId }` | cloud | `productApi.ts` | YES | OVEREXPOSED_INTERNAL_DOMAIN | Returns full `ProductDefinition` | Legacy current web; UI20 uses preview |
| CURRENT | CONFIGURATOR | Confirm | POST | `/api/products/:productCode/confirm` | `{ values, reviewId, requestId? }` or legacy `{ definition, reviewId }` | truth, scoped eic/price, `commercialExperience`, `installationPrequoteReady` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | Safe path is values + `crv1` | Do not resubmit ProductDefinition |
| CURRENT | COMMERCIAL | Freeze quote | POST | `/api/products/:productCode/quote-snapshots` | `{ values, reviewId, customerId, requestId? }` or legacy definition | `{ created, quoteSnapshot, commercialExperience, requestLink? }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | Safe path is values + `crv1` | Do not resubmit ProductDefinition |
| CURRENT | QUOTE | Read quote by product | GET | `/api/products/:productCode/quote-snapshots/:quoteSnapshotId` | none | `{ quoteSnapshot }` scoped | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | Domain snapshot JSON | Adapter |
| CURRENT | QUOTE | Quote PDF | GET | `/api/products/:productCode/quote-snapshots/:quoteSnapshotId/document` | none | PDF bytes | cloud | `productApi.ts` `quoteDocumentUrl` | YES | READY_FOR_UI20 | schemaVersion 2 refused | Do not reprice |
| CURRENT | QUOTE | Accept quote | POST | `/api/products/:productCode/quote-snapshots/:quoteSnapshotId/acceptance` | none | `{ created, acceptanceDecision, quoteSnapshot }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | Idempotent persist | Adapter |
| CURRENT | QUOTE | Read acceptance | GET | `/api/products/:productCode/quote-snapshots/:quoteSnapshotId/acceptance` | none | `{ acceptanceDecision, quoteSnapshot }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | QUOTE | Quote registry | GET | `/api/quotes` | none | `{ overview }` | cloud | `quotesApi.ts` | YES | READY_FOR_UI20 | | Adapter |
| CURRENT | QUOTE | Quote inspection | GET | `/api/quotes/:quoteSnapshotId` | none | `{ quote, quoteSnapshot, acceptance, order, request }` | cloud | `quotesApi.ts` | YES | READY_FOR_UI20 | Mixed overview + snapshot | Adapter |
| CURRENT | ORDER | Create order | POST | `/api/products/:productCode/quote-snapshots/:quoteSnapshotId/order` | none | `{ created, orderSnapshot, quoteSnapshot, acceptanceDecision }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | Server requires acceptance | Adapter |
| CURRENT | ORDER | Read order by quote | GET | `/api/products/:productCode/quote-snapshots/:quoteSnapshotId/order` | none | `{ orderSnapshot, quoteSnapshot, acceptanceDecision }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | ORDER | Read order | GET | `/api/products/:productCode/orders/:orderSnapshotId` | none | `{ orderSnapshot }` scoped | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | RELEASE | Create production release | POST | `/api/products/:productCode/orders/:orderSnapshotId/production-release` | none | `{ created, snapshot, orderSnapshot }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | Frozen from order input | Adapter |
| CURRENT | RELEASE | Read production release | GET | `/api/products/:productCode/orders/:orderSnapshotId/production-release` | none | `{ snapshot, orderSnapshot }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | RELEASE | Accept production snapshot (non-order) | POST | `/api/products/:productCode/accepted-production-snapshot` | `{ definition, reviewId }` | `{ created, snapshot }` | cloud | `productApi.ts` | NO | OVEREXPOSED_INTERNAL_DOMAIN | Compatibility / inspection | Do not use as first-vertical happy path |
| CURRENT | RELEASE | Read snapshot | GET | `/api/products/:productCode/accepted-production-snapshots/:snapshotId` | none | `{ snapshot }` | cloud | none required | OPTIONAL | READY_WITH_ADAPTER | | Adapter |
| CURRENT | JOB | Job overview | GET | `/api/jobs` | none | `{ overview }` | cloud | `jobsApi.ts` | YES | READY_FOR_UI20 | | Adapter |
| CURRENT | JOB | Job traveler | GET | `/api/jobs/:jobId` | none | job, scoped order, quote/request refs, release id, execution view | cloud | `jobsApi.ts` | YES | READY_FOR_UI20 | Stronger operator projection | Preferred job read |
| CURRENT | EXECUTION | Create plan | POST | `/api/products/:productCode/accepted-production-snapshots/:snapshotId/execution-plan` | none | `{ created, executionPlan }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | Order-release gate server-owned | Adapter |
| CURRENT | EXECUTION | Read plan by snapshot | GET | `/api/products/:productCode/accepted-production-snapshots/:snapshotId/execution-plan` | none | `{ executionPlan }` | cloud | `productApi.ts` | YES | READY_WITH_ADAPTER | | Adapter |
| CURRENT | EXECUTION | Read plan | GET | `/api/execution-plans/:planId` | none | `{ executionPlan }` | cloud; operator cookie used for relation | `productApi.ts` | YES | READY_FOR_UI20 | Workshop financial scope | Adapter |
| CURRENT | EXECUTION | Assign provider | POST | `/api/execution-tasks/:taskId/provider` | `{ providerId }` | plan or typed error | cloud+owner | `productApi.ts` | YES | READY_FOR_UI20 | Eligibility server-owned | Adapter |
| CURRENT | EXECUTION | Assign executor | POST | `/api/execution-tasks/:taskId/executor` | `{ personId }` | plan or typed error | cloud+owner | `productApi.ts` | YES | READY_FOR_UI20 | Compatibility path | Prefer claim-on-start |
| CURRENT | EXECUTION | Start / claim | POST | `/api/execution-tasks/:taskId/start` | none | plan or typed error | operator | `productApi.ts` | YES | READY_FOR_UI20 | | Adapter |
| CURRENT | EXECUTION | Complete + actuals | POST | `/api/execution-tasks/:taskId/complete` | `{ completedQuantity?, note?, actualConsumption? }` | plan or typed error | operator | `productApi.ts` | YES | READY_FOR_UI20 | Planned qty never overwritten | Adapter |
| CURRENT | PLANNING | Set planned effort | POST | `/api/execution-tasks/:taskId/planned-effort` | `{ plannedEffortMinutes: number \| null }` | plan or typed error | cloud+owner | `planning.ts` | YES | READY_WITH_ADAPTER | PLANNED only; UNKNOWN is null | Adapter |
| CURRENT | PLANNING | Read provider workload | GET | `/api/planning/workload` | none | derived provider groups + unassigned open tasks | cloud | `planning.ts` | YES | READY_WITH_ADAPTER | Not persisted totals | Adapter |

Idempotency observed (server `created` / `alreadyApplied`), not a client key:

- quote freeze, acceptance, order, production snapshot/release, execution plan persist
- request/customer/installation patches
- task mutations return `alreadyApplied` when applicable

---

## CURRENT — existing, not first-vertical required

These routes exist at the audited SHA. They are not invented. First vertical does not need them to configure LETTERS and run Cerere → Execuție.

| Status | Domain | Method | Route | Auth | First vertical use | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| CURRENT | PEOPLE | GET | `/api/people` | cloud | OPTIONAL (assignment lists come on plan view) | READY_WITH_ADAPTER |
| CURRENT | PEOPLE | GET | `/api/people/skills` | cloud | NO | READY_WITH_ADAPTER |
| CURRENT | PEOPLE | GET | `/api/people/eligibility` | cloud | NO | READY_WITH_ADAPTER |
| CURRENT | PEOPLE | POST/PATCH | `/api/people`, `/api/people/:personId`, skills | cloud+owner | NO | READY_WITH_ADAPTER |
| CURRENT | PEOPLE | PUT | `/api/people/:personId/operator-pin` | cloud+owner | NO | READY_WITH_ADAPTER |
| CURRENT | SELLER | PATCH | `/api/seller` | cloud+owner | NO | READY_WITH_ADAPTER |
| CURRENT | INVENTORY | GET/POST | `/api/inventory`, `/api/inventory/:resourceId`, adjustments | cloud; adjust owner | NO | READY_WITH_ADAPTER |
| CURRENT | ADMIN | GET | `/api/components`, `/api/product-system-admin`, `/api/resources-admin`, `/api/operational-processes`, `/api/workcenters`, `/api/governance` | cloud | NO | READY_WITH_ADAPTER |
| CURRENT | ADMIN | PATCH/POST | product-system display labels, resource cost evidence | cloud+owner | NO | READY_WITH_ADAPTER |
| CURRENT | OPS | GET/PATCH | `/api/operational-services`, `/api/operational-services/:capabilityId` | cloud; patch owner | OPTIONAL | READY_WITH_ADAPTER |

---

## CURRENT / MAIN-INTEGRATED — UI20 safe transport

These are canonical on `office952/workos-final` main `1f409ab728668d2daace37273055177075fecd7c` (PR #33). Isolated UI20 must use them. ProductDefinition browser roundtrip is not required.

| Status | Domain | Operation | Method | Route | Purpose | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| CURRENT | AUTH | Contract identity | GET | `/api/health` | `apiContractId = workos-ui-contract-v1` | READY_FOR_UI20 |
| CURRENT | CONFIGURATOR | Preview | POST | `/api/products/:productCode/preview` | Visible fields, selected modules, readiness, missing, `crv1` | READY_FOR_UI20 |
| CURRENT | CONFIGURATOR | Confirm by values | POST | `/api/products/:productCode/confirm` | `{ values, reviewId: "crv1:…" }` | READY_WITH_ADAPTER |
| CURRENT | COMMERCIAL | Freeze quote | POST | `/api/products/:productCode/quote-snapshots` | `{ values, reviewId: "crv1:…", customerId }` | READY_WITH_ADAPTER |
| CURRENT | COMMERCIAL | Experience | field on confirm / quote freeze | n/a | Next action / stage | READY_FOR_UI20 |

## FUTURE — not authorized by transport V1

Do not implement from UI20. CORS / cross-origin auth remains future work only if a proven deployment requires it. Preferred production topology is same-origin.

| Status | Domain | Operation | Method | Route | Purpose | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| FUTURE | AUTH | Cross-origin UI | CORS allowlist | n/a | Not authorized; same-origin preferred | NOT_IN_V1 |

---

## Counts (CURRENT first-vertical rows only)

Rows in the first table excluding the non-vertical `accepted-production-snapshot` compatibility POST and the dev operator bypass:

```text
API_CONTRACT_COUNT = 53
API_READY_COUNT = 23
API_READY_WITH_ADAPTER_COUNT = 26
API_GAP_COUNT = 3
UNKNOWN_COUNT = 0
TRANSPORT_CONTRACT_ID = workos-ui-contract-v1
```

Remaining first-vertical overexposure: raw template GET, process-composition, and legacy compile. UI20 must use preview + values/`crv1` confirm/quote instead. CORS is unchanged (same-origin).

Dev operator bypass is excluded from the count.

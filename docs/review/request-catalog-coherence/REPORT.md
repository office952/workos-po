# Request and Catalog coherence — source candidate

Date: 2026-10-07. Repository: `office952/workos-po`. Branch: `feat/product-system-request-coherence`. Parent/checkpoint: `3046aa700fcd8cb8384ed63497fad62f83b79aaa`; prior UI base: `b5071b6acb59025edbdf82338c5c3613dcd7a5d3`.

## Result

Catalog now reads the existing ProductSystem definition projection and exposes composition, constructive properties, material/process references and links to existing versioned technical settings/formulas. It has no customer/request lookup, commercial session binding or creation dialog. Supported labels remain editable through the existing revisioned API; unsupported structural authoring is explicitly read-only.

Cereri and the client hub open one `/cereri/noua` intake: existing client or CUI-assisted quick registration, title/description, enabled product or `Momentan indecis`. The request is saved before configuration. CUI lookup first searches the active organization's customers, then optionally uses ANAF; duplicates are refused on customer POST/PATCH. Failed lookup supports manual entry; a retry after request failure reuses the customer already created.

Request detail owns product selection and lists started assemblies. A reviewed letters/logo product can be attached to an available typed assembly before separately configuring ACM support. Attachment carries its reviewed facts and commercial payload, blocks overlapping edits, and can be retried without recreating the assembly after a known successful creation. Assembly links derive customer/request/product/role from the server. Confirmed member facts can be read back from server truth when no local draft exists. Local product drafts have bounded request/product/assembly recovery in the existing tab session; cross-organization/session boundaries clear it.

The retired `CatalogContextDialog`, Catalog commercial routing and unused styles are removed. Stable AGENTS/authority docs link to one active flow canon and one roadmap. Previous roadmap/acceptance flags and Catalog recovery instructions are marked historical or withdrawn. Configuration formulas, commercial calculation, snapshots and the execution lifecycle stay in the same domain/API engine.

## Verification

- Frontend: `pnpm exec vitest run --maxWorkers=2`: **103 files / 479 tests passed**. Covers central request creation, product/undecided continuation, existing CUI selection, customer reuse on retry, pending/unmount guards, definition-only Catalog, 100-product filtering/pagination, route migration and draft continuity; existing commercial/auth regressions remain green.
- API: six focused suites (`product-assembly`, `logo-assembly-v2`, `cloud-isolation`, `fiscal-lookup`, `customers`, `system`): **21 tests passed** using isolated synthetic test databases. The assembly journey checks request-owned reopening and persisted member values. Fiscal lookup tests use mocked ANAF; no real company query was made.
- Domain assembly suites: **2 files / 13 tests passed**.
- Frontend and engine typecheck: passed.
- Frontend lint: zero errors, 11 existing fast-refresh warnings. Engine lint: passed.
- Frontend production build: passed; `index-0TF_W6_F.js`, `index-Cis62Vk-.css`. Existing size advisory remains; no claim that Owner's Windows runtime serves these assets.
- `git diff --check`: clean.

## Browser status and limits

**Browser verification is blocked, not passed.** Local preview was built on isolated loopback port 4177. Playwright's browser binary was absent and its download returned invalid/truncated archives. The computer-use browser connection then timed out. There are no new geometry measurements, screenshots, keyboard runtime evidence, dark/light acceptance or synthetic browser E2E claims for this candidate. Unit/API tests do not substitute for that proof. Owner's Windows reference runtime and Cursor processes were not controlled or changed.

The complete arbitrary product-definition editor is still missing. This candidate connects the existing inspection and supported edit contracts; it does not claim full component/material/process authoring. The active canon describes the next domain-owned contract needed. Durable cross-device draft persistence is not added. CUI duplicate checks and upstream throttling are application/process guards, not distributed uniqueness/rate-limit guarantees. Interrupted create requests are not server-idempotent or rolled back.

## Integration boundary

Source branch only. No merge, deploy, real Cloud/business-data write, new schema/migration/seed or main change. Cursor's checkpoint remains preserved. Candidate is code-verified and available for review; UI acceptance and deployment are pending.

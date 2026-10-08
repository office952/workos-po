# Request and Catalog coherence — source candidate

Date: 2026-10-07. Repository: `office952/workos-po`. Branch: `feat/product-system-request-coherence`. Parent/checkpoint: `3046aa700fcd8cb8384ed63497fad62f83b79aaa`; prior UI base: `b5071b6acb59025edbdf82338c5c3613dcd7a5d3`.

Functional coherence baseline reviewed by Cursor: `4a100f38bb75111a5a6f491aec2c5c829357aed0`. Evidence documentation at `7d40fc5` did not change that implementation. The later request-intake presentation stage is recorded separately below; the baseline's runtime results are not new proof for the later UI.

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

**The initial Codex browser attempt was blocked; subsequent isolated Cursor runtime verification is reported complete for the scoped journey.** Local preview on port 4177 lacked a working Playwright binary and the computer-use browser connection timed out. That attempt produced no browser proof. It is preserved here as history, not the current gate status. Cursor's later Windows review is recorded below. Codex inspected the supplied dark intake screenshots and checked decisive source contracts; it did not independently operate or rerun the Windows candidate. Owner visual acceptance is not declared.

The complete arbitrary product-definition editor is still missing. This candidate connects the existing inspection and supported edit contracts; it does not claim full component/material/process authoring. The active canon describes the next domain-owned contract needed. Durable cross-device draft persistence is not added. CUI duplicate checks and upstream throttling are application/process guards, not distributed uniqueness/rate-limit guarantees. Interrupted create requests are not server-idempotent or rolled back.

## Follow-up: undecided request continuation

Cursor's reported isolated Windows review at `836cc9ecbaf03ece03c3578ac027c6d31ea0c64a` used candidate UI/API ports 5185/8790 and a `SYNTHETIC_TEST` Cloud root. Catalog inspection passed in a snapshot. The undecided request `CER-4F6BF94F` saved and reopened, but the API returned `NEW` / `OPEN_REQUEST`, so the UI correctly omitted its `CHOOSE_PRODUCT` picker. Scenarios C–F were not executed; browser geometry/theme capture froze twice. This is reported evidence, not an independently rerun browser result.

The shared domain next-action projection now returns `CHOOSE_PRODUCT` for requests in `NEW`, `IN_REVIEW` or `READY_FOR_QUOTE` without linked offers. List, client workspace and detail inherit the same rule. Request status, attention and quote readiness are not modified. Waiting, blocked and cancelled requests preserve their existing action; linked offers retain priority. No frontend status fallback was introduced.

Regression verification: domain request/customer workspace suites **27 tests passed**; real API request/customer workspace suites **16 tests passed**; frontend RequestDetail/NewRequest/Requests/worklist action suites **56 tests passed**. Coverage includes all request statuses, linked-offer priority, POST new request → GET list/detail while still `NEW`, and product selection navigating with the original customer/request identity without a status mutation. The subsequent Windows candidate verification is recorded below. Full original suites above were not redundantly rerun for this narrow correction.

Frontend build/typecheck, engine typecheck, lint for changed frontend/domain/API files and `git diff --check` also passed for this correction. Frontend bundle hashes remain unchanged because the functional correction belongs to the shared domain projection.

## Scoped runtime verification at 4a100f3

Evidence basis: Cursor reports supplied by the Owner on 2026-10-07, the supplied correction/API notes and three dark intake captures. The final ACM, light and keyboard report was supplied as text; its referenced media remains in the Windows evidence directory and was not supplied for independent image review. This is attributed synthetic runtime evidence, not a new Codex browser run or Owner acceptance.

Identity reported: detached clean worktree `C:\Users\offic\.cursor\worktrees\workos-po\review-request-catalog-coherence`; UI/API 5185/8790; organization WorkOS Test; reused Cloud root `workos-candidate-review-20261007-220257-1f0168df` with `bootstrapPolicy=SYNTHETIC_TEST` and `CLASSIFICATION=SYNTHETIC_REFERENCE`. Owner runtimes 8787/4188/4189/4173 and checkpoint `3046aa7` remained untouched.

| Scenario | Scoped result and evidence |
| --- | --- |
| A Catalog | Inspection passed in the previous session; no commercial client/request dialog. Structural authoring remains read-only. |
| B Undecided | `CER-4F6BF94F` remains `NEW`, receives `CHOOSE_PRODUCT`, shows the picker and navigates with the same customer/request/product. |
| C CUI | Synthetic existing CUI lookup and duplicate POST refusal (409) passed. Manual fallback and selection of the existing client passed. Live ANAF autofill was not exercised. |
| D Chosen product | Saving the request before entering its product configuration passed. |
| E Letters + ACM | Final report closes the earlier partial result: ACM confirmed through UI; letters facts NORD/45000/60 preserved; assembly confirmed; reload keeps both members complete. |
| F Stale price | Changing markup 35 to 40 after calculation shows the stale-price state and disables freeze until recalculation. |

Assembly `asm:2da2b162-ebab-4a95-be35-5bf750ccca08` was reported `CONFIRMED`, with `canConfirm=false` after confirmation. Synthetic ACM values: NORD, 1200×800, clearance 40/20; engine-calculated cost 112.14 EUR. These fixture values/cost are not Owner production measurements, rates or accepted company cost evidence. No offer freeze, order or production action was taken in the completion check.

Dark intake captures at reported widths 1440/768/390 were supplied and inspected. Cursor subsequently reported light verification at measured CDP viewports 1440×768, 768×900 and 390×844, including product/save sections and the confirmed assembly summary. The valid 1440 product/save capture is `light-cerere-noua-produs-salvare-1440x768.png`; `light-cerere-noua-produs-1440x768.png` repeats the top and does not prove that section. Media location: `%TEMP%\workos-candidate-evidence-20261007-220257\light\`.

Keyboard report: core tab order reaches customer, brief, product and save without submitting a duplicate request; client-select focus ring observed; Escape closes Cont and returns focus to its trigger. Automated Tab did not consistently expose measurable `:focus-visible` in CDP. This is scoped keyboard evidence, not a full accessibility/contrast audit. No stop-after-two browser blocking occurred in the final completion check.

Review disposition: functional verification is sufficient to close this candidate's scoped recovery gate, with reported-runtime provenance explicit. The next gate is Owner inspection at `http://127.0.0.1:5185/`. Header whitespace remains a visible UX advisory. Complete definition authoring remains a separate unfinished capability, not implied by this verification.

## Integration boundary

Source branch only. No merge, deploy, real Cloud/business-data write, new schema/migration/seed or main change. Cursor's checkpoint remains preserved. The functional coherence baseline has scoped synthetic runtime verification reported by Cursor. The subsequent request-intake UI remains a source candidate pending its own browser verification; Owner visual acceptance and integration/deployment remain pending.

## Request-intake UX stage — 2026-10-08

Owner instruction: implement the request area first, then the Configurator, in separate reviewable stages. Preserve the existing Cereri de oferta register's industrial visual character and use the whole desktop width. The Owner approved the direction of the new-request simulation, not runtime acceptance of this implementation.

Source base: `7d40fc5c5763ae3359cadf27b956be109dd9c19e`, same active branch. Scope is `/cereri/noua` and its collection presentation/loading chrome. The register, request detail, Configurator and domain/API are not redesigned here.

Changes:
- Compact request-specific header; full-width desktop client/brief columns, stacked below 1024px. The loading route uses the same presentation surface.
- Dedicated `request-intake.css`, using existing WorkOS theme roles. Old intake rules and the 1000px cap were removed from `product-system.css`.
- Existing-client search/selection summary and explicit quick-registration/CUI controls; lookup fallback, duplicate refusal and server-owned `canCreateRequest` remain intact.
- Product and undecided choices share the selection area. Small collections omit unnecessary search/taxonomy controls; large collections reuse existing search/filter/pagination, including 100-product tests. Default picker presentation remains for Catalog and request detail.
- Footer reflects selected client/product and the real next action. Request persistence still precedes navigation to configuration; no product definitions, pricing or readiness calculations moved into UI.

Checks for this stage:
- Frontend typecheck passed.
- Frontend lint passed: zero errors, the same 11 existing fast-refresh warnings.
- Five focused suites passed: **33 tests**, including chosen→undecided continuation, manual registration after unavailable CUI lookup, server permission enforcement, delayed/pending guards and 100-product selection.
- Catalog and RequestDetail compatibility suites passed: **28 tests**. Total for this stage: **61 tests / 7 suites**; no full-suite rerun or live API run is claimed.
- Engine typecheck and lint passed; engine source is unchanged.
- Build passed: `index-DGtXxywo.js`, `index-BNiL2VLI.css`. Existing bundle-size advisory remains.
- Source diff whitespace check passed.

Browser status: **BLOCKED / NOT PROVEN**. No Chromium executable was installed in this workspace; Playwright's browser download failed with invalid/truncated ZIP responses. No geometry, dark/light screenshots, keyboard acceptance or Windows-runtime proof is claimed for this stage. Static responsive rules do not replace browser proof. The Owner's existing UI/API processes and all real data remain untouched. The Windows preview at 5185 still serves the earlier candidate until its clean review checkout is explicitly updated and rebuilt.

Handoff update: the Owner requested Cursor to load/build/run only, with no audit, screenshots or browser review. The Owner then responded positively and asked to continue to the Configurator. This is a positive inspection response, not an automated geometry/accessibility evidence pack.

## Configurator workspace stage — 2026-10-08

Source base: `e62c1ad9da558347af554356e3a290a80c87072a`; same active source branch. Owner-approved direction: technical workspace first, vertical layers/sections and focused settings; graphics and imagery later.

Research used: the supplied Product Configuration Research Dossier, especially fixed/configurable/measurement ownership, focused component editing and assembly/member continuity; supplied ProductDefinition compiler, ProductAggregate and Pricing Registry documents for separation of technical structure and commercial calculation. Their historical Python routes/statuses are reference research, not current implementation truth. Current PO AGENTS, schemas, transport/adapters and architecture canon control the implementation.

Delivered:
- Compact Configurator header/loading chrome, full-width desktop construction area, vertical server-schema section selection with entered-value summaries, one visible editor and previous/next navigation.
- Read-only composition from server identity facts and selected components. Fixed materials do not become free-text product options. No illustrations or invented component fields.
- Server-reported missing fields open/focus the relevant section; conditional controls track the returned schema. Section navigation preserves all owned drafts and does not call confirm or attach APIs.
- Confirmation locks immediately after an edit until preview succeeds; failed preview remains locked and supports explicit retry with the same draft.
- Existing internal cost, customer price, stale-result protection, freeze, seller recovery and typed assembly continuation are preserved. No engine/API/schema, seeds, migrations or real-data operations.
- Styles remain in `configuration-workbench.css`; its lock styling moved out of the unrelated Product System stylesheet. No new UI framework or styling bulk in ui.css.

Verification: frontend typecheck/build pass; lint zero errors and the same 11 existing warnings. Engine typecheck/lint pass with unchanged engine source. Five workspace/Configurator/schema/loading suites: **48 tests**. Four assembly/session/intake/request compatibility suites: **53 tests**. Final build assets: `index-BmN7eixV.js`, `index-GkHWiGoy.css`; existing bundle-size advisory persists. Total **101 tests / 9 suites**, covering section continuity, option labels, read-only composition, missing-field focus, changing schema, pending-preview lock, retry, commercial freshness, assembly attach/member reopening and request context. No full-suite/API runtime or browser rerun is claimed.

Browser/visual status remains **NOT PROVEN for this source delta**: the local environment has no usable browser executable, as recorded in the preceding stage. Owner manual inspection is the next gate after loading/building the published commit in the existing synthetic candidate. Cursor is requested to run only. Earlier runtime evidence at 4a100f3 does not prove this new layout. Responsive source rules cover desktop, 768px and phone, but are not geometry evidence.

Remaining limits: images/CAD illustration, persisted arbitrary group/layer overrides, complete definition authoring and a further dedicated global-shell refinement. This source stage reorganizes existing server-authorized configuration; it does not manufacture these missing capabilities. No merge, deployment or Owner-reference runtime change.

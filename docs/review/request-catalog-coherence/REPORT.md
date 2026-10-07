# Request and Catalog coherence — source candidate

Date: 2026-10-07. Repository: `office952/workos-po`. Branch: `feat/product-system-request-coherence`. Parent/checkpoint: `3046aa700fcd8cb8384ed63497fad62f83b79aaa`; prior UI base: `b5071b6acb59025edbdf82338c5c3613dcd7a5d3`.

Functional source reviewed by Cursor: `4a100f38bb75111a5a6f491aec2c5c829357aed0`. Subsequent documentation-only commits record evidence; they do not change the reviewed product implementation.

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

Source branch only. No merge, deploy, real Cloud/business-data write, new schema/migration/seed or main change. Cursor's checkpoint remains preserved. Candidate is code-verified with scoped synthetic runtime verification reported by Cursor; Owner visual acceptance and integration/deployment are pending.

# Commercial workspace UI V1

Review candidate from `6466f14a715767ddcf63ca80e7a6e4a4df4ae6bd`, the client pilot direction liked by Owner on 2026-10-07. Owner subsequently requested stable title/count/action positions between Clienți and Cereri, and authorized the next commercial wave. This is not a new business model or visual acceptance.

## Shared page geometry

`PageHeader` and `styles/layout/pilot-page.css` own the pilot title, eyebrow slot, title band, counts and breakpoints. Cereri no longer has a second geometry definition. Two title lines are reserved; actual longer identities can grow without clipping. The intake illustration occupies its own size-contained area and does not size the counts band. Counts span the available width. Loading chrome uses the same pilot variants and unknown (`—`) metric slots, including the client hub. Navigation and commands belong in the body toolbar.

The shared geometry is a baseline, not a promise that every object has identical height: longer identities, explanatory copy and wrapped metrics need space. Exact alignment and viewport overflow require browser measurement. There is no browser measurement or fresh Windows screenshot claim for this revision. Owner will review the built revision on Windows.

Remembered client identity remains context memory; it no longer paints the first/previously opened row as selected. Hover and keyboard focus retain feedback. Amber attention markers retain their server meaning.

## Task-specific body layout

| Surface | Responsibility |
| --- | --- |
| Catalog | Full-width product registry; search and product-family filter in toolbar; assemblies in a distinct searchable section, even when no standalone products are returned. Unverified context allows inspection but no configuration or assembly creation. |
| Configurator | Schema section navigation, technical inputs and server review, then a separate commercial preparation region. All drafts and operations remain in the existing parent page. No wizard state, implicit confirm or fake CAD. |
| Assembly | Scope selector with a visible selected state; existing aggregate review and commercial operations remain explicit. |
| Oferte registry | Server attention flags, stage/search filtering, fixed action widths, reset and retry including failed refresh of cached data. `createdAt` stays creation time. |
| Request detail | Brief, files and installation remain intact. Canonical next action is in the body toolbar. |
| Frozen quote | Reference identifies the quote when envelope is available; client price/PDF precede internal analysis. Internal cost uses the existing completeness-aware presenter in a disclosure. No universal requirement for an aluminium profile line. |

## Configuration field ownership map

The generic renderer follows returned sections, field IDs, labels, options and types. This map documents current definitions; it is not a frontend field list or a rule for additional products.

| Input/fact | Current server section/component | Editability and meaning |
| --- | --- | --- |
| `root.inscription` | `product` / ROOT | Operator input, label from schema (letters text, logo name or work designation). |
| `face.finish`, conditional `face.color` | `face` / FACE, Letters/Logo | Returned choices; no browser-invented compatibility. |
| `face.confirmedAreaMm2` | `face` / FACE, Letters/Logo | Operator-confirmed area in mm²; not inferred geometry. |
| `volume.depthMm`, `volume.finish`, conditional `volume.color` | `volume` / VOLUME, Letters/Logo | Returned choices and conditional fields. |
| `volume.confirmedPerimeterMm` | `volume` / VOLUME, Letters/Logo | Confirmed perimeter in mm; not browser-measured drawing. |
| `face.widthMm`, `face.heightMm`, `face.cassetteDepthMm`, optional `face.backReturnMm` | `cassette` / FACE, ACM | Dimensions in mm and optional lip, according to schema. |
| Product identity facts | Product template projection | Read-only construction specification. |
| Selected components, missing facts, readiness | Preview projection | Server-owned review, not local business state. |
| Cost lines, completeness, calculation/verification status | Confirm projection | Server calculation with existing financial visibility. Unknown/incomplete cost is not zero. |
| Pricing method; markup, discount, adjustment; manual net price | Commercial drafts | Existing role permissions and explicit server recalculation; no formula evaluation in UI. |
| Net, VAT, gross and frozen quote | Confirm/snapshot projections | Server result and historical version. A previous frozen quote is identified separately from the current draft. |

Technical edits still clear confirmation. Both technical confirmation and commercial recalculation use the existing confirm endpoint. Assembly member persistence still occurs only inside explicit confirm. Freeze preserves the existing prerequisites and payload; layout navigation sends no business mutation.

## Assembly creation recovery

Creation is explicitly labelled, has pending/error feedback, and disables duplicate clicks. A context epoch suppresses late navigation after leaving/changing the context. Pending state is discarded when context changes, including A → B → A. A late request may have created a server object; ignoring its response is not a rollback or an idempotency guarantee.

## Limits and next work

- The assembly projection does not supply authoritative customer/request context to its configuration links; the existing session continuity remains. Do not infer ownership from labels or add a second truth.
- No new editable formula module, uploads, document signing, invoicing, portfolio or client-specific fork.
- No engine, persistence, auth or protected-checkout changes; no seed/reset, real data mutation, merge or deployment.
- Next after Owner review: Lucrări, then Planificare/Atelier/Execuție. Larger functional gaps stay separate from this UI wave.

## Verification of this candidate

- Frontend: `vitest run --maxWorkers=2`, 472 tests / 100 files passed. Auth + loading/header subset also passed, 30/30. An earlier unconstrained full run hit two initial DOM wait timeouts in App.cloudAuth; the complete final source was verified with bounded concurrency. No claim about remote CI.
- `tsc -b --pretty false`: passed. ESLint: zero errors, 11 existing warnings.
- Vite build: passed; `index-B1_k3_9I.js`, `index-Bhp_pGuh.css`. This is a built artifact, not a claim that Owner's runtime serves it. Existing intake WebP assets are unchanged.
- Read-only reviews covered commercial ownership/actions and technical/commercial state preservation. Their concrete findings were corrected and covered by the final suite where applicable.
- Browser geometry, screenshots and served-build acceptance remain Owner review, not inferred from unit tests.

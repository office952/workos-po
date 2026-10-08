# Request, Catalog and configuration

Active Owner direction, 2026-10-07. This document owns the responsibilities and user flow. `docs/ROADMAP.md` owns implementation status. Earlier Catalog-first commercial instructions are superseded, including the withdrawn recovery saved at `3046aa700fcd8cb8384ed63497fad62f83b79aaa`.

## Responsibilities

| Surface | Owns | Source |
| --- | --- | --- |
| Catalog `/catalog` | Reusable product definitions: composition, components, constructive properties, materials, processes, calculation references | Domain ProductSystem projection `/api/product-system-admin` |
| Product availability `/admin/products` | Organization enablement for new work | Existing versioned ProductEnablement |
| Technical settings `/admin/technical` | Editable technical parameters, scoped to a component when opened from Catalog | Existing typed, versioned domain settings |
| Formulas `/admin/formulas` | Editable supported formulas and their allowed references; component scope from Catalog | Existing typed, versioned formula registry |
| Resources `/admin/resources` | Material/resource rates and evidence | Existing resource and cost-evidence contracts |
| New request `/cereri/noua` | Customer selection or explicit quick creation, work brief, optional product choice | Organization-scoped Customer and CommercialRequest APIs |
| Request detail | Brief, files, installation facts, product choice and reopening started assemblies | Server detail/nextAction and request-owned assembly projections |
| Configurator | Instance facts, dimensions/options, technical review, cost and sale-price preparation for the request | Returned product form schema and compiler/confirm APIs |
| Assembly | Independent product members and explicit typed relations, then aggregate commercial/execution continuation | Existing domain Assembly contracts |

Catalog has no customer/request prerequisite, no remembered commercial binding, no create-request dialog and no offer action. Definition inspection never navigates into a commercial configuration. Historical Catalog URLs carrying a request redirect to that request's product choice; customer-only URLs redirect to request intake. A product-only Catalog URL selects its definition.

## Commercial flow

1. Start a new request from Cereri or the current client hub. Both open the same intake.
2. Select an existing client, or enter a CUI to look up the organization first. An existing normalized CUI selects the existing record; legacy multiple matches require an explicit selection. Otherwise ANAF lookup can prefill a client profile. The operator checks/edits the data and explicitly saves. Unavailable external lookup allows manual entry.
3. Enter the work title and description. Choose an enabled product or keep `Momentan indecis`. Save the request before entering a product configuration. The undecided case opens request detail.
4. Configure the selected product in the request. Returned schema owns facts/options; the browser does not calculate geometry, formulas, business readiness or sale totals.
5. Review/confirm and explicitly recalculate after changing commercial terms. A stale result does not permit freezing an offer. Issuer fetch failure is distinct from a confirmed missing issuer configuration.
6. Add a manufactured support panel through an available typed assembly offering. Attach the reviewed letters/logo and its commercial payload; configure the panel separately. Existing members remain server persisted and can be reopened. Adding a panel never resets the letters' facts.
7. Continue through the existing frozen quote, acceptance, order, production and execution lifecycle.

A supplied/existing site panel remains HostContext. A fabricated ACM cassette is a ProductTemplate/member; those concepts must not be merged. Assembly v1/v2 are existing persisted domain contract versions, not competing UI variants.

## Configurator presentation

The 2026-10-08 Owner-directed workspace separates Configurație, Verificare and Pregătire ofertă as associated keyboard-navigable work-area tabs. The Owner-supplied `WORKOS_UI_DESIGN_AUTHORITY_V14_BACK_VARIANT_FIXED_POLISH.html#configurator` is the current layout reference: context/component outline on the left, vertical construction and selected technical context in the center, one visible inspector on the right. Selection is shared across these zones. The compact selector replaces the outline at narrower widths; at tablet/phone widths the editor precedes the construction context. Graphics remain deferred, and the supplied HTML is a design reference rather than a second runtime or business engine.

Explicit server component identifiers bind schema sections and fixed identity facts; components already represented by an editor are not duplicated. Letters/logo expose Față, Volum, Spate and Electrică / iluminare individually. A selected component without editable schema fields has a read-only properties inspector and a link to its Catalog definition. An unlit ACM does not acquire a lighting component. No field-prefix or display-label guessing supplies ownership.

The preview supplies read-only component details from the existing domain evaluator: measured dependencies, technical setting provenance/version and calculated quantities. BACK exposes its mapped FACE area; lighting exposes its perimeter source, module/power/supply quantities and resolved organization settings. Source-field actions open the corresponding schema editor. Settings/formula links lead to the existing organization administration; they do not create instance overrides. The frontend renders server-formatted values and never computes technical quantities or price. An edited draft immediately hides prior measured/calculated details and input values until the new preview is ready; failed refresh leaves them unavailable.

Switching sections or work areas does not confirm, calculate, mutate request status or erase drafts. Summaries display entered facts and option labels; they do not calculate measurements or infer readiness. The composition view reads product identity facts and selected components as read-only. Editable sections follow the actual server schema; no unsupported back/lighting controls or synthetic group overrides are created merely to complete an illustration. Verificare presents facts without inputs; Modifică opens and focuses the corresponding editor. Explicit successful confirmation proceeds to commercial preparation only while the operator remains in review. Cost details and evidence are collapsed in commercial preparation, rather than extending the technical editor's side column.

Missing-field navigation uses the server's field identifiers to open and focus the corresponding editor. Confirmation is unavailable during preview refresh or after a preview error; retry preserves the request/product draft. Cost and client price remain in their existing separate preparation area, with existing stale-price and freeze protections. Graphics/images are deferred. Multi-group inheritance and arbitrary per-layer overrides remain future domain contracts, not local UI state advertised as persisted product truth.

## State and failure rules

- Server session determines organization; no frontend organization override or client-specific fork.
- An undecided request in `NEW`, `IN_REVIEW` or `READY_FOR_QUOTE`, without a linked offer, receives `CHOOSE_PRODUCT` from the domain projection. Product selection starts configuration; it does not advance the request status or declare quote readiness. `WAITING_CUSTOMER`, `BLOCKED` and `CANCELLED` retain their existing continuation. A linked offer keeps `OPEN_QUOTE` priority. The UI follows this server action.
- CUI matching strips optional RO and spaces. CUI input is syntactically checked for lookup; no unsupported checksum/fiscal-registration claim is made. API POST/PATCH refuse normalized duplicates within the current organization. This is an application guard, not a new cross-replica database uniqueness constraint.
- ANAF v9 is read-only/advisory, with a six-second timeout, bounded cache and one outbound call per second per process. Errors do not create customers. No fiscal registration status is inferred from a CUI prefix. Multi-replica deployments still need a shared upstream rate limiter if traffic requires it.
- If customer creation succeeds and request creation fails, intake retries the request using the created customer.
- Pending actions reject repeated clicks; late responses after leaving the route cannot navigate or bind another context. This does not promise rollback or server idempotency after network interruption.
- Draft facts are separated by request, product and assembly, with a bounded recovery bank in the existing tab session. A→B→A restores the corresponding draft. Organization/session boundaries clear the bank. This is browser session continuity, not new durable cross-device draft persistence.
- Confirmed assembly members can be restored from their server truth when no local draft exists. A failed member read blocks editing/confirmation and offers retry. Editing during an attach/freeze operation is disabled.
- Definition list and enabled commercial offerings have separate API ownership and share only collection presentation. Search/family/category filters and local pagination support a synthetic collection of 100 products; this is not a claim of 100 authored production templates.

## Delivered boundary and next implementation

The current Catalog presents existing definitions, changes labels through the existing revisioned API and links to supported settings, formulas and rates. Constructive properties without an existing edit contract are read-only and identified as such. There is no complete arbitrary ProductTemplate/component/material/process authoring editor yet.

A complete definition editor requires a domain-owned mutation/versioning contract first: typed properties/options, component binding, process/resource references, formula references, validation, permission projection and new-work version resolution. Historical quotes/production keep frozen versions. Design and implement that as an extension of the same ProductSystem and Catalog, not another catalog or frontend calculation engine. Any required schema/migration or real data change needs separate Owner authorization. Arbitrary scripting formulas and inferred CAD geometry remain outside this candidate.

Support-dependent BACK machining remains an unimplemented product extension. The researched technical direction is frame support → grooved back, panel support → flat back. The prototype's Cu canal / Fără canal toggle explicitly requires Product Truth mapping. Before it becomes an operative control, define typed support/profile compatibility, required machining dimensions, side closure behavior, process/resource evidence and version resolution in the domain. Do not present a local toggle as a saved or costed manufacturing choice. This rule is distinct from a commercial installation service and does not turn a manufactured support into a letter's BACK component.

No merge, production deployment, real Cloud access, real business-data write, migration or seed is implied by this direction. Synthetic tests and browser proof establish candidate behavior, not Owner visual acceptance or production rollout.

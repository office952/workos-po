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

No merge, production deployment, real Cloud access, real business-data write, migration or seed is implied by this direction. Synthetic tests and browser proof establish candidate behavior, not Owner visual acceptance or production rollout.

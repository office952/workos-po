# Commercial & Financial Control V1

Status: integrated on `main` through PR #136 (`346c007`). Synthetic data only. Commercial Role Clarity V1 (§9) is in review on `feat/commercial-role-clarity-v1`.

Owner GO: "WORKOS — COMMERCIAL AUTONOMY & FINANCIAL CONTROL V1 · OWNER GO — ONE CONSOLIDATED IMPLEMENTATION WAVE" (2026-11-16). It accepts five principles:
1. organization offering policy;
2. Comercial decides the request outcome;
3. acceptance with incomplete internal cost only by an explicit Owner exception (AUD-PRICING-002);
4. company identity with the eight existing fields, a mandatory fiscal id, versions, audit, and no real data in code;
5. financial control limited to estimated cost, operational cost and margins, with no accounting margin and no costing of duration.

The five principles are summarised in the Owner decision note `WORKOS_COMMERCIAL_FINANCIAL_V1_OWNER_DECISION.md`, a local note kept outside Git.

The pricing formula is unchanged: R-001A manual net price. There is one engine. Permissions stay fixed per role; there is no per-organization RBAC.

## 1. Rights

| Action | Server rule | Proprietar | Comercial (`member`) | Producție / Atelier |
| --- | --- | --- | --- | --- |
| Set the manual client price (product, installation) | `prices.manual.set` **or** (`offering.policy.use` + organization policy allows it) | always | only in `COMMERCIAL_AUTONOMOUS` / `COMMERCIAL_APPROVAL_POLICY` | never |
| Freeze and issue the quote | the price right above + policy decision on the server | always | within policy, or after an approval of the exact variant | never |
| Request a price approval | `offering.policy.use` | — | yes | never |
| Approve / reject a price exception | `quotes.price_exception.approve` | yes | no | never |
| Change the offering policy | `org.settings.manage` | yes | no | never |
| Decide the request outcome (not pursued, declined, close, reopen, resume) | `requests.outcome.manage` | yes | yes | never |
| Accept the quote / create the order | `quotes.accept` | yes | no | never |
| Accept with incomplete internal cost | `quotes.accept.incomplete_cost` (separate from the price exception) | yes | no | never |
| See internal cost, margins, rules, thresholds | `costs.internal.read` / `org.settings.manage` | yes | no (payload never contains them) | no |
| Read / edit the company identity | read `prices.client.read`; write `org.settings.manage` | read and write | read | no |
| Job economics (planned vs operational) | `costs.internal.read` | yes | no | no |

## 2. Offering policy

- Table `organization_offering_policy_versions` holds immutable versions.
- No row means `OWNER_ONLY`, the pre-V1 behaviour.
- Modes:
  - `OWNER_ONLY`: small company; the Owner prices and freezes.
  - `COMMERCIAL_AUTONOMOUS`: the Comercial prices and freezes without seeing internal cost.
  - `COMMERCIAL_APPROVAL_POLICY`: the Comercial freezes within the rules; an exception goes to the Owner.
- Rules in the approval mode have no default values. The Owner enables each rule and enters its value:
  - internal cost not complete;
  - minimum margin over internal cost. If the cost is not complete, the margin cannot be verified and approval is required.
  - maximum net value without approval.
- The approval mode needs at least one active rule. Without one the Comercial is blocked (fail-closed).
- Evaluation runs only on the server. The Comercial receives only `outcome` and a message: no cost, threshold or rule identifier.
- An approval is bound by hash to:
  - organization and request;
  - product and confirmed configuration;
  - product net price and installation net price;
  - policy version.

  Any change makes it stale. Decisions are written once, and transitions are append-only (`commercial_price_approval_events`).
- New quotes priced by a Comercial, or under a stored policy, carry an additive frozen `offering` record:
  - policy version and mode;
  - who priced the quote, and with which role;
  - the approval.

  Historical snapshots and their hashes are unchanged. An Owner quote under the platform default carries no record (identical to pre-V1).
- Assemblies are not covered in V1. Assembly quotes stay Owner-only (`assemblies.manage`, `prices.manual.set`).

## 3. Price, discount, adjustment

The manual-first contract (R-001A) stays authoritative:
- there is no calculated price for new quotes;
- the manual net price is the client net price;
- discount and adjustment are 0 and are part of the net price;
- VAT and gross come from the commercial policy.

Separate discount and adjustment operations would change the pricing formula. They are not part of this wave; see §8.

## 4. AUD-PRICING-002

- A quote with incomplete internal cost can be frozen (manual price). Acceptance requires `incompleteCostAcceptance: { confirm: true, reason }` from a role with `quotes.accept.incomplete_cost`.
- The exception is stored in `quote_incomplete_cost_acceptances` (immutable) and copied into the order snapshot (`incompleteCostAcceptance`, Owner scope only).
- Production release accepts such an order. The cost stays `PARTIAL` everywhere, and the quote snapshot is not modified.

## 5. Company identity

- Fields: legal name, brand, fiscal id, trade register, address, locality, IBAN, bank (`seller_profile`).
- History lives in `seller_profile_versions`: immutable, with author, time and changed fields.
- Concurrency: the Date firmă page always sends `expectedVersion`; a stale version is refused with 409. Exact limit: a client that omits `expectedVersion` (pre-V1 scripts, the synthetic owner-review seed, direct API calls) is **last-write-wins**. Such a write still needs `org.settings.manage`, is validated, and is recorded as a new version with its author, so it is recoverable from the history; it is not protected against a concurrent edit. No first-party UI writes without the version (the old `updateSeller` client was removed).
- Validation:
  - legal name and fiscal id are required on save;
  - jurisdiction is never inferred: the Romanian rule (published control digit, key 753217532) applies only when the identifier declares the country with the `RO` prefix. A control-digit mismatch is a **warning** (compatibility with existing profiles), never a refusal;
  - any other value, including digits without a prefix, gets a structural check only and is reported explicitly as "Țara nu este cunoscută: identificatorul este verificat doar ca format", with no country-specific claim;
  - an IBAN, when given, must pass ISO 13616 (mod 97).
- Empty fields are omitted from documents.
- Frozen quotes and orders keep the identity copied at issue time.
- Real data:
  - the real company identifiers previously in `packages/domain/src/seller/identity.ts`, tests and a CI workflow were replaced by the visibly synthetic `SYNTHETIC_DEMO_SELLER` (bank code `DEMO`);
  - only the local single-plane runtime (development and tests; production refuses it) seeds that synthetic seller;
  - Cloud organizations start unconfigured;
  - existing local databases were not touched;
  - Git history was not rewritten.
- Schema decision for later: a country/jurisdiction field. It would make the fiscal-id check jurisdiction-specific instead of shape-based. It is not authorized in this wave.

## 6. Planned vs operational (`GET /api/jobs/:jobId/economics`, Owner only)

| Value | Definition |
| --- | --- |
| Estimated cost | internal cost (EIC) frozen at acceptance, with its completeness |
| Operational cost | recorded actual consumption × rate frozen at acceptance (`projectActualInternalCost`) |
| Confirmed accounting cost | **not modelled**; always reported as such |
| Unknown value | `null`, shown as "Necunoscut", never 0 |
| Difference | operational − estimated, only over resources with both a plan and recorded consumption; shown with its sign and meaning ("+… peste estimare", "−… sub estimare") |
| Estimated margin | order net price − estimated cost, only when the estimate is COMPLETE |
| Operational margin | order net price − operational cost, only when the operational cost is COMPLETE; an operational indicator, not net profit |

Scope and limits:
- Scope is the product line of the order. An installation service is excluded from both sides and reported.
- Recorded work time and machine time are not converted to cost: no rule is configured for it.
- Assemblies: see section 10.

## 7. Screens

| Screen | Route | Notes |
| --- | --- | --- |
| Administrare › Firma › Date firmă | `/admin/company` | Owner edits; other roles read only; history; validation messages per field; concurrent edit notice |
| Administrare › Cum calculezi › Reguli de ofertare | `/admin/offering` | mode, rules (approval mode), versions, approval requests (approve / reject with reason) |
| Configurator › Pregătire ofertă | — | outcome, approval request with optional note, status (pending, approved, rejected with reason, stale) |
| Oferta înghețată › Confirmă comanda | — | reason and explicit confirmation when the internal cost is incomplete |
| Fișa lucrării › Situație | — | Planificat vs realizat (Owner only) |

**Design dependency:** WorkOS-N page "13 · Administrare" has no frames yet for these screens (FIGMA_WRITE = NO in this wave). The screens reuse the existing Administration components. Owner visual acceptance is pending; parity is not claimed.

## 8. Not in this wave

- Separate discount and adjustment operations on top of the manual price.
- A country/jurisdiction field.
- Contact fields, logo or footer on documents.
- Confirmed accounting costs and an accounting margin.
- Costing of recorded duration.
- Assembly price-exception approvals.
- Invoicing.

## 9. Commercial Role Clarity V1

Owner GO: "WORKOS — COMMERCIAL ROLE CLARITY V1 · OWNER GO — ONE CONSOLIDATED IMPLEMENTATION WAVE" (2026-11-16). It closes the findings of the Owner & Commercial usability validation. Rights, modes, formulas and snapshots are unchanged.

**Unconfirmed internal rates.** The projection is server-side, in `scopeRateAcknowledgementRequirement` and `scopeFrozenRateAcknowledgement`. Amounts were already owner-only. The rate list itself (resources, context, provenance) is now owner-only as well. The engine still evaluates the unscoped requirement.

| Payload | Proprietar | Comercial | Producție / Atelier |
| --- | --- | --- | --- |
| Configurator, rates affect only the internal cost (`DISCLOSURE_ONLY`) | full list with amounts | `null` | `null` |
| Configurator, rates drive the selling price (`REQUIRED`) | full list, binding | status only, `rates: []`, no binding | `null` |
| Frozen quote acknowledgement | full record | omitted | omitted (quote refused) |

**OWNER_ONLY continuation.** A user without the pricing right sees an explicit state on Configurator › Pregătire ofertă:
- the configuration is ready, and the Proprietar sets the price;
- who does what next, and what happens after freezing;
- a link back to the request.

The inactive "Îngheață oferta" button is no longer shown to that user. There is no hand-over action, notification or saved draft: an unfrozen configuration stays in the browser tab until a quote is frozen, and the screen says so. A server-side configuration draft per request would need its own contract (not in this wave).

**Internal cost notice.** For a role without financial access, the notice is neutral ("Costul intern este vizibil doar Proprietarului") instead of an error tone.

**Request decisions.** Fixes a demonstrated defect. The decision routes already let the Comercial close, reopen, resume or record a request's outcome (`requests.outcome.manage`), but the request detail projection hid those actions from every non-owner. `scopeRequestDetailProjection` now keeps the outcome actions (`SAVE_DECISIONS`, `SAVE_AND_CLOSE`, `CLOSE_OFFERLESS`, `REOPEN`, `RESUME_OFFER`) for an actor that holds that right, so they appear in "Mai multe" on the request. The following stay owner-only:
- acceptance;
- order creation;
- administrative cancellation;
- account identifiers.

Producție and Atelier see none of these actions and are refused by the server.

**Planificat vs realizat.**
- Differences carry a sign and a meaning.
- A partial operational cost is marked "nu este total final".
- The number of resources without an operational cost is stated.
- Formulas are unchanged, and the operational margin stays unknown while the cost is partial.

## 10. Assembly & Production Supervision Coherence V1

One rule set for products and assemblies; no schema migration (all additions are optional fields of existing JSON snapshots).

**Incomplete cost at assembly acceptance.**
- `resolveIncompleteCostAcceptance` (domain) is the single decision used by `recordQuoteAcceptance` and `acceptAssemblyQuote`.
- An assembly quote is cost-complete only when every part is `COMPLETE` and the frozen assembly operation cost is `COMPLETE`. A quote frozen without operation-cost evidence is never assumed complete.
- `POST /api/assemblies/:assemblyId/accept` takes the same `incompleteCostAcceptance: { confirm: true, reason }` and the same capability. Refusals: 422 `incomplete_cost_requires_owner_acceptance`, 403 for a role without the capability.
- The exception (actor, reason, time, quote id and hash) is stored inside the hashed assembly order snapshot. Orders accepted earlier are unchanged and stay valid.
- `GET /api/quotes/:id` reports `acceptance.incompleteCostExceptionRequired` only to a role that reads internal cost.

**Freeze eligibility and price-only changes.**
- `GET /api/assemblies/:id` returns `freezeBlockers` (member, code `PRICE_MISSING`) and `memberPrices`; `quoteFreezable` is false while a blocker exists. The freeze route keeps its own check.
- Saving a member with the same technical facts and another price keeps the assembly `CONFIRMED`: the assembly truth is issued again (`reconfirmAfterCommercialOnlyChange`), so a quote frozen before the change is no longer current and is refused at acceptance. Frozen quotes are never rewritten.
- A member re-evaluated on current rates is not a price-only change: review and confirmation stay explicit.

**Planned vs operational for an assembly job.**
- New assembly orders keep each part's frozen cost lines (`children[].eicLines`).
- `GET /api/jobs/:jobId/economics` returns `grouping: "PART"`: each part is compared with the consumption recorded on its own operations (`projectAssemblyActualInternalCost`); the same resource in two parts stays two lines.
- Assembly operations keep their frozen estimate; their operational cost is unknown (`null`), never zero, because recorded time is not converted to cost.
- An assembly order accepted before cost lines were retained returns `available: false` with the reason; nothing is recalculated from current rates.

**Supervision.**
- Supervisory decisions (material confirmation, external provider, hand-off, return, closing a correction) are taken on the job sheet › Operații from the signed-in account; the server routes and capabilities are unchanged (`execution.supervise`, `planning.manage`).
- The operator workspace (PIN) keeps start, participation, completion and quality control. It shows external facts read-only and, at a material block, who resolves it (`materialBlockResolverLabel`, from the role matrix) with an issue report of reason `MATERIAL`. The report is visible to Producție; no separate notification is sent.

**Design:** WorkOS-N page 07, section 34 (`1550:32579`).

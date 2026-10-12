# Commercial UX coherence V1

Candidate branch `feat/commercial-ux-coherence-v1`, base `d65c049bf76ee35e43d7613ec6cbdec14153ffea` (PR #67 merge). Presentation-only refinement of Oferte, quote detail and the request → quote link. No business rule, API contract change, persistence or migration.

## 1. Diagnosis (before implementation)

Evidence: isolated synthetic runtime on `127.0.0.1:8789`, owner-review fixture seeded through HTTP (6 frozen quotes: 5 product, 1 assembly with order). Measured at 1440, 1024, 768 and 390 CSS px. Reference: the accepted Cereri register.

### Oferte registry

| Area | Finding |
| --- | --- |
| Information hierarchy | Uses the generic worklist row, not the accepted Cereri table grammar. Column headings are sentence-case sans; Cereri uses calibrated mono headings and a list strip ("Lista de cereri · N din M"). |
| Commercial value | Total and creation date share one wrapped string ("743,48 EUR · 12.10.2026, 18:45"). The amount has no emphasis or alignment. |
| Responsive loss | At ≤1151 px the product and total columns are hidden. At 1024 and 768 px the operator cannot see what is offered or its value. At 390 px value is also missing; the request code breaks mid-identifier ("CER-" / "D8CC8752"). |
| Kind | Assembly is only a text prefix in the secondary line. Product quotes have no kind marker. |
| Status | Stage badges are right-aligned against the product column; the "Stare" heading is left-aligned. Attention ("Urmează acceptarea") is muted metadata in the identity line, not a state signal; the 3 attention quotes are not visually marked. |
| Search and filters | Search has no visible label or placeholder. Stage and kind chips share one undivided single-select group, so "Ansambluri" and "Creată" cannot be combined. At 1024 px the chips render before the search field. |
| Counts | "Oferte" and "Necesită atenție" counts are static; Cereri counts act as filters. |
| Selection | No selected-quote context. The header's right half is empty at desktop (≈280 px tall header with no information on the right). |
| Actions | Ordered rows send the only action to the order. The quote itself is reachable only through the reference link, with no visible distinction between "open quote" and "open order". |
| Density | Long product labels wrap to three lines; row height varies (88–110 px). |

### Assembly quote detail

| Area | Finding |
| --- | --- |
| Identity | Pilot title renders the quote reference at up to 78 px, followed by ≈150 px of empty reserved header space. |
| Commercial total | Appears only after all sections. At 390 px "Total comercial" starts at y = 1062 (viewport 844). |
| Field separation | Sections use a two-column fact grid: role/product on the left, Net on the right, VAT on the left again, total on the right. Related values of one section are scattered. |
| Status | Kind and stage are two small badges beside the back link. |
| Internal cost | Unstyled disclosure summary ("▼ Cost intern · evidență (…)"); content is correct and owner-only. |
| Navigation | Request / assembly / order links are stacked paragraphs at the end with large gaps. |

### Standalone quote detail

| Area | Finding |
| --- | --- |
| Hierarchy | Same oversized reference title and empty header band. |
| Price | Net price is the hero value; the total with VAT is small meta text. The assembly page emphasizes nothing. The two kinds do not share one commercial hierarchy. |
| Actions | "Marchează acceptată" is isolated on the right of the toolbar; PDF download is inside the price panel; client/request links are at the end. |

### Related navigation

- Request detail, assembly work: "Deschide oferta comună" links to `/ansamblu?assembly=…#oferta`, not to the frozen assembly quote `/oferte/ansamblu/:id`, although the request projection already returns the assembly `quoteSnapshotId`; the frontend adapter collapsed it to a boolean.
- Quote detail pages return only to `/oferte`.

### Role-sensitive information

Correct before this change and preserved: internal cost is present only for owners; members receive no `internalCost` key. Selling price is visible to all signed-in users.

## 2. Design decisions

1. Oferte adopts the Cereri register grammar: semantic table, mono headings, list strip with result count, search with icon and placeholder, actions with arrows, amber attention mark. Styling moves to `src/styles/surfaces/offers.css`; the quotes-registry rules leave `commercial.css`.
2. Counts become filters (Total / Necesită atenție), as in Cereri.
3. Kind and stage are separate, combinable filter groups. Kind appears only when both kinds exist.
4. Row content: reference + kind marker; client + request; offered product (two-line clamp) + inscription; value right-aligned with "cu TVA"; stage + attention; created date; one next action. At 768–1151 px the date column is removed and stage moves under the value. At < 768 px rows become compact cards that keep reference, kind, client, value, stage and action.
5. The empty header half shows a selected-quote sheet (desktop/tablet only): reference, kind, client, offer, value, stage, with separate "Deschide oferta" and, when present, "Deschide comanda". Row click / Enter / Space selects without navigating, matching Cereri.
6. Quote details share one structure: compact pilot header (no giant title), a commercial summary strip directly under the header (total with VAT first, then net, VAT, stage, kind, primary action), sections as a real table with a totals row, internal cost as a labelled owner-only panel, and a compact link rail.
7. Request → assembly quote link opens the frozen quote page.

Not changed: totals, VAT, stage derivation, next actions, acceptance/order flows, financial access, assembly cost completeness, tenant isolation.

## 3. Changed files

| File | Change |
| --- | --- |
| `src/surfaces/QuotesPage.tsx` | Register rewrite: list strip, labelled search, separate kind/stage filters, count filters, selected-quote sheet, semantic table, responsive cards. Data comes from the existing quote overview transport. |
| `src/styles/surfaces/offers.css` (new) | Register and quote-detail styles (modular ownership). |
| `src/styles/surfaces/commercial.css` | Removed the old quotes-registry / quote-detail rules. |
| `src/surfaces/quoteDetail.tsx` (new) | Shared presentational parts: `QuoteSummary`, `QuoteLines`, `QuoteRelations`. Values are rendered as received. |
| `src/surfaces/AssemblyQuotePage.tsx` | New hierarchy: summary → sections table → owner cost panel → links. |
| `src/surfaces/QuoteSnapshotPage.tsx` | Same hierarchy. Accept, order creation and PDF download handlers are unchanged. |
| `src/presentation/customerPrice.ts` (new), `commercialPrice.tsx` | Customer-price readiness helper extracted (same rule: complete, no unavailable reasons, value present). |
| `src/layout/PageHeader.tsx`, `SlicePage.tsx`, `routeChrome.ts`, `RouteLoadingPage.tsx`, `styles/layout/pilot-page.css` | `pilot-compact` header variant for single-quote pages (loading state included). |
| `src/api/types.ts`, `src/adapters/requestAdapter.ts`, `src/surfaces/RequestDetailPage.tsx` | The request assembly work keeps the `quoteSnapshotId` the API already returns; "Deschide oferta comună" opens `/oferte/ansamblu/:id`. |
| Tests | `QuotesPage`, `AssemblyQuotePage`, `QuoteSnapshotPage`, `RequestDetailPage`, `requestAdapter`, `RouteLoadingPage`. |

No file under `apps/api` or `packages/domain` changed.

## 4. Evidence (synthetic)

Runtime: `127.0.0.1:8789`, served from this worktree, isolated root `C:\Users\offic\.cursor\worktrees\workos-po\commercial-ux-coherence-v1\.tmp\commercial-ux-e2e-root` (synthetic owner-review fixture). The Owner reference runtimes on 8787 / 8788 were not touched. Screenshots are kept outside Git:

`C:\Users\offic\.cursor\worktrees\workos-po\commercial-ux-coherence-v1\.tmp\commercial-ux-screens\`

| Before (`before\`) | After (`after\`) |
| --- | --- |
| `COMMERCIAL_UX_BEFORE__01_oferte_1440.png` | `COMMERCIAL_UX_AFTER__01_oferte_1440.png` |
| `COMMERCIAL_UX_BEFORE__02_assembly-quote_1440.png`, `__03_assembly-quote-scrolled_1440.png` | `COMMERCIAL_UX_AFTER__02_assembly-quote_1440.png`, `__03_assembly-quote-cost-owner_1440.png` |
| `COMMERCIAL_UX_BEFORE__04_product-quote_1440.png` | `COMMERCIAL_UX_AFTER__04_product-quote_1440.png`, `__10_product-quote-member-no-cost_1440.png` |
| `COMMERCIAL_UX_BEFORE__05_oferte_1024.png` | `COMMERCIAL_UX_AFTER__05_oferte_1024.png` |
| — | `COMMERCIAL_UX_AFTER__06_oferte_768.png`, `__07_assembly-quote_768.png` |
| `COMMERCIAL_UX_BEFORE__06_oferte_390.png`, `__07_assembly-quote_390.png` | `COMMERCIAL_UX_AFTER__09_oferte_390.png`, `__08_assembly-quote_390.png` |
| — | `COMMERCIAL_UX_AFTER__11_oferte-selected-light_1440.png` (light theme, selected row) |

Browser checks performed:

- Register: 6 synthetic quotes (5 product, 1 assembly). No horizontal overflow at 1440, 1024, 768 or 390 px.
- Filters combine. "Ansambluri" returns `OF-2A229869`. "Produse" + "Creată" returns 3. Search "Alpha" returns `OF-BBF9AD5E`. "Necesită atenție" + "Alpha" returns the empty state. Reset clears everything and returns focus to search.
- The reference link always opens the quote. The row action opens the order when one exists, otherwise the quote. In the sheet, "Deschide oferta" and "Deschide comanda" are separate.
- Selecting a row (click, Enter, Space) updates the sheet without navigating.
- Assembly quote total ("Total cu TVA") is at y = 276 at 1440 px and y = 297 at 390 px. Before, it was at y = 1062 at 390 px.
- Totals equal the API values: assembly 743,48 EUR, product 624,82 EUR. The section rows plus the service row add up to the totals row.
- Owner (`owner@workos.test`): the "Cost intern" panel is present; the API returns `internalCost` / financial data. Member (`comercial@workos.test`): no "Cost intern" in the UI and no internal-cost data in the API response.
- Viewing frozen quotes sends only GET requests (session, health, quote/snapshot). Quote stages and totals in the register were identical before and after the browser pass.
- Request detail: "Deschide oferta comună" → `/oferte/ansamblu/asmq%3Aasmt%3Ab38b7710768f8783c1f27f25`.
- Dark and light themes checked.

## 5. Accessibility

- The register is a semantic `table` with column headers. Where the selected-quote sheet is shown, rows are focusable, labelled ("Previzualizează oferta …") and selectable with Enter / Space. On narrow screens rows are not focus stops; links and buttons stay native.
- The search input has a visible placeholder and a visually hidden `label` ("Caută"). Filter groups are labelled groups and use `aria-pressed`.
- The summary is a region "Rezumat comercial". The section table is labelled by its heading through `aria-labelledby`, so there is no duplicate caption. Row headers use `th scope="row"`. Cards on narrow screens show `data-label` captions.
- Links are a `nav` "Legături ofertă". The internal-cost disclosure is a native `details/summary` inside a region "Cost intern".
- Attention and partial cost are carried by text as well as colour ("Urmează acceptarea", "Cost parțial").

## 6. Invariants preserved

Product Truth, assembly contracts, BACK Forex / ACM ownership, Formula Engine, totals and VAT, accepted snapshots, assembly EIC, lifecycle, tenant isolation and role permissions are unchanged. No new engine, no API or domain change, no migration and no persistence change. Missing costs still render as partial ("Cost parțial" with the missing inputs). Frozen quotes stay read-only; the only mutations are the existing acceptance and order actions on the product quote, which are unchanged.

## 7. Test results

`pnpm verify:all`, exit 0, final run after the last change:

| Suite | Result |
| --- | --- |
| Frontend typecheck, lint | OK. Lint: 0 errors, 13 warnings, all pre-existing. |
| Frontend tests | 110 files, 543 tests passed |
| Frontend build | OK |
| Engine typecheck, lint | OK |
| Domain tests | 103 files, 685 tests passed |
| API tests | 93 files, 570 tests passed |

## 8. Known limitations

1. **Register total vs detail total for product + on-site installation quotes (pre-existing, not changed).** The register value (`grossDisplay`, `packages/domain/src/quotes/overview.ts`) uses the product-only commercial total. The quote detail, the PDF and the order use `jobCommercial` (product + installation). For such a quote the register shows a lower value than the detail. The synthetic fixture has no such quote. Aligning them is a domain change and needs an Owner decision.
2. Mobile cards (390 px) are taller (≈196–216 px), because they now include value and offered product.
3. There is no 768 px "before" capture; the 1024 and 390 px captures show the pre-change state.
4. Hovered or selected register rows may show faint sub-pixel seams between cells in some zoom levels (fixed table layout with percentage widths). Not confirmed; cosmetic.
5. Evidence is synthetic only. No real business data or Cloud was used.

## 9. Owner visual review checklist

- [ ] Oferte at 1440: list strip, filters and row density read like Cereri.
- [ ] Count filters ("Oferte", "Necesită atenție") and kind/stage filters combine as expected.
- [ ] The selected-quote sheet is useful, and "Deschide oferta" vs "Deschide comanda" are clear.
- [ ] At 1024 / 768: value, product and stage stay visible.
- [ ] At 390: cards are readable and the request code no longer breaks.
- [ ] Assembly quote: the total is visible without scrolling; sections, the totals row and the service row are clear; Letters and ACM stay separate rows.
- [ ] Product quote: total with VAT first, then net and VAT; acceptance and PDF actions are placed correctly.
- [ ] The internal-cost panel appears only for the owner, and "Cost parțial" stays explicit.
- [ ] Links (Cerere / Ansamblu / Comandă, Client) are clear; the request page opens the frozen assembly quote.
- [ ] Light theme parity.
- [ ] Decide whether limitation 1 (register total excluding installation) should become a domain GO.

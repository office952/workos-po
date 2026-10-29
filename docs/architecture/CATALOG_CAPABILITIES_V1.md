# Catalog capabilities V1

Status: local contract candidate for R-003 / R003-A. This document describes the read-only projection. It does not replace Product Truth, ProductEnablement, technical settings, formulas, or the Catalog page.

```text
SCHEMA_VERSION = catalog-capabilities.v1
ROUTE = GET /api/catalog/capabilities
AUTHORITY = packages/domain/src/product/catalogCapabilities.ts
WRITES = NONE
```

## What it is

`projectCatalogCapabilities` derives a versioned manifest from the current product registry, form schemas, component types, technical-setting definitions, formula definitions, back-manufacturing recipe lookup, and the organization resolutions passed in by the API. The route reads the authenticated runtime:

- `resolveProductEnablement()`
- `resolveTechnicalSettings()`
- `resolveFormulas()`
- `labels()`

It does not persist a second product model and it does not calculate price, cost, or geometry.

## Classifications

| Class | Source |
| --- | --- |
| `PLATFORM_FIXED` | Template `fixedValues`, identity facts, and the ACM developed-sheet boundary |
| `ORGANIZATION_SETTING` | Technical-setting definitions for component types on the template |
| `ORGANIZATION_FORMULA` | Formula definitions for those component types. The AST stays on `/api/admin/formulas` |
| `ORGANIZATION_ENABLEMENT` | The resolved ProductEnablement entry for that template |
| `REQUEST_FACT` | Fields present on the template form schema |
| `UNSUPPORTED_OR_FUTURE` | Evidenced gaps: grooved-back channel recipe when absent, organization presets, process-graph editing |

`SCHEMA_SELECTABLE` means the schema offers the option. It is not a production, cost, or recipe verdict. `GROOVED` stays `NOT_PREPARED` while `forexBackChannelRecipe()` is absent. `PLATFORM_STARTER` versions are not marked organization-confirmed. Inactive enablement returns `enabledForNewWork: null` instead of the platform default.

Logo remains in the platform library. The code-default enablement list does not turn it on.

The ACM developed blank area keeps `nesting: false`. ACM has no lighting component. Logo has no BACK request fields.

## Permissions and money

Cloud mode uses the existing session middleware. Owner and member may read. Edit flags follow the existing owner check. `canViewFinancialAmounts` is always false: this payload has no price, cost, or evidence amounts. Canonical writers remain:

- `POST /api/admin/product-enablement`
- `POST /api/admin/technical-settings`
- `POST /api/admin/formulas`
- `PATCH /api/admin/product-system/entities/PRODUCT_TEMPLATE/:code/display-label`

## Out of this contract

Catalog UI, presets, process-graph rendering, new persistence, and commercial or EIC changes are outside R003-A.

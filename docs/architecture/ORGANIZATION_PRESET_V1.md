# Organization preset V1

Status: local contract for R003-C. This is not a persistence authorization.

```text
SCHEMA_VERSION = organization-preset.v1
AUTHORITY = packages/domain/src/product/organizationPreset.ts
READ_PROJECTION = CatalogCapabilitiesManifest.products[].presetContract
WRITES = NONE
PERSISTENCE = ORGANIZATION_VERSIONED
ROUTE = POST /api/catalog/presets
```

## Layers

| Layer | Meaning |
| --- | --- |
| `PLATFORM_DEFINITION` | WorkOS template, version, fixed materials and form schema |
| `ORGANIZATION_OFFERING` | ProductEnablement for new work |
| `ORGANIZATION_PRESET` | Named revision of supported closed options for one organization and one template version |
| `REQUEST_CONFIGURATION` | Job text, colors, confirmed measurements and later frozen snapshots |

A published preset does not mean the technology is production-ready, the product is offered, cost evidence is complete, resources are available, or a quote or job is ready.

## Eligibility

A field is preset-eligible only when it is a `select` with options, `visibleWhen` is `always`, and the field is not a platform `fixedValues` key.

That excludes inscriptions, free text colors, confirmed areas and perimeters, numeric job dimensions, job-only visibility such as `back.supportKind`, organization technical settings, and formulas.

`back.profile = GROOVED` stays `NOT_PREPARED` while `forexBackChannelRecipe()` is absent. ACM currently has no preset-eligible field because its schema is measurements.

## Revisions

`planOrganizationPresetRevision` is pure. Owner only. Member is rejected. The organization id on an existing revision must match. `expectedRevision` must match. A retired revision cannot be reopened. Retirement copies the previous selections. A template version change blocks a new published revision and leaves the previous revision intact. Accepted snapshots are not an input and are not rewritten.

Where-used is `{ available: false, reason: "no_request_reference_index" }` until a real request reference exists.

## Persistence

Migration `050_organization_product_preset_revisions.sql` appends one immutable revision per save. Rows are scoped by `organization_id`. The active lifecycle is the latest revision. `POST /api/catalog/presets` calls `planOrganizationPresetRevision` and inserts the planned revision. Owner may create, publish and retire. Member may read published and retired revisions. Drafts stay with the owner.

The migration runs with the existing synthetic test databases. It is not an authorization to migrate a real Cloud root.

Where-used remains unavailable until request rows reference a preset. Applying a published preset in the Configurator copies only the stored selections. Job text, colors and measurements already on the draft stay unless they are themselves one of those selections. Quote and production snapshot tables are not updated by a preset save.

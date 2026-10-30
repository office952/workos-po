# Catalog process graph V1

Status: local candidate for R-003 / R003-D and R003-E. This is a read-only projection. It does not replace Product Truth, recipes, cost evidence, or the editors that already own them.

```text
SCHEMA_VERSION = catalog-process-graph.v1
ROUTE = GET /api/catalog/process-graph?product=&scenario=
AUTHORITY = packages/domain/src/processes/graphProjection.ts
WRITES = NONE
```

## What it shows

The route builds the closed reference scenarios already defined for letters, logo, and the unlit ACM panel. Each scenario is marked illustrative. The dimensions inside those scenarios are the existing inspection fixtures. They are not a request, a quote, or a measurement taken from a job. A product without a reference scenario returns `NO_REFERENCE_SCENARIO` and an empty graph.

Every `dependsOn` becomes one directed edge. The simplified view hides an edge only when another path already connects the same nodes. The API sends both edge lists and `hiddenEdgeCount`. The page draws the list it was given.

For the current letters scenario without finish, the engine composition is 12 nodes and 14 direct edges. Three edges are redundant: back cutting already reaches closure through the lighting chain, wiring already reaches the ignition test through the power-supply step, and closure already reaches final inspection through the uniformity test. An earlier note expected only the last two. The projection follows the dependencies that exist now.

## Recipes and cost evidence

Each node resolves a recipe with `recipeForProcessScope(processId, scope, typeId)`. Face CNC, back CNC, and ACM sheet cutting stay distinct. A missing evidence row keeps `rate: null`. It is not stored as zero. The same evidence row used by several operations is listed on each of them. The page does not multiply a rate by the illustrative quantity and does not present that product as a price.

Rates and currency are omitted from the JSON unless the caller is an owner. On the single-plane runtime the existing owner check is true, so the local runtime includes rates. A cloud member does not receive them.

Organization formula versions and technical settings are passed into the same composition options the product compiler already uses. If either resolution fails, the route returns 409 and does not invent a graph. Accepted quotes, orders, production snapshots, and tasks are not read or rewritten.

## Page

Catalog keeps the product in `/catalog?product=`. The scenario, the selected operation, simplified or direct mode, and zoom stay in the page. The inspector shows dependencies, successors, the inclusion condition, and the blockers already on the node. Links go to the existing technical-setting, formula, and cost-evidence pages. There is no save action and no start action.

The textual list is the alternative to the map. Below 1280px it is placed before the map. Styles live in `src/styles/surfaces/catalog-process-graph.css`.

## Out of scope

Process-graph editing remains `NOT_IMPLEMENTED`. This projection does not add a recipe writer, a tariff, a migration, or an assembly recipe. ACM plus letters stays an assembly, not a node on one product template.

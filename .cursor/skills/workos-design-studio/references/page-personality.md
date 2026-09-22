# Page personality

```text
ONE WORKOS LANGUAGE
+
DIFFERENT PAGE JOBS
```

These are design intents. They are **not** permission to invent routes, states, business logic, or fields.

Current implementation evidence lives in `src/layout/SlicePage.tsx` (`PageWorkspace`) and `src/layout/routeChrome.ts`. Existing runtime UI is evidence, not automatic visual authority.

## Workspace jobs

| `PageWorkspace` | Job | Current route evidence |
| --- | --- | --- |
| `stack` | Stack / list. Scan a set, open the next object. | Cereri, Oferte, Lucrări, Fundație |
| `collection-with-rail` | Stack / list with an intake rail. Select or register, then continue. | Clienți |
| `object` | Object detail. One current object, its state, the next safe action. | Client, Cerere, Ofertă |
| `configuration` | Configuration instrument. Technical / spatial construction. | Configurator |
| `catalog` | Catalog. Choose a product into an already-known job context. | Catalog |
| `traveler` | Traveler / job continuity. The same job across release, plan, planned vs actual. | Lucrare |
| `operational` | Operational workspace. Dense, actionable, minimum ceremony. | Atelier, Execuție, Planificare |
| `operational-gate` | Operational gate. Identify the actor, then enter the workspace. | Used when the operational floor must first identify who is working |
| `admin` | Admin. Configure shared values that affect new work, not historical snapshots. | `/admin/*` |

Wrong personality is a review finding: a stack that behaves like a dashboard, a traveler that behaves like a form dump, an operational floor that behaves like a settings page.

## Surface intents

Where relevant, intended personality:

| Surface | Intent |
| --- | --- |
| Cerere | contextual intake |
| Configurator | technical / spatial instrument |
| Ofertă | commercial clarity |
| Lucrare | job continuity |
| Atelier | dense actionable workspace |
| Execuție | focus and minimum ambiguity |

Configurator intent is recorded context only. `CONFIGURATOR_REDESIGN = NO` in this wave. Future Configurator design requires a separate Owner GO.

## One language

Every personality still answers:

- where am I
- what object am I dealing with
- what state is it in
- what should I do next
- what happens if I act

Shared language: `CALM INSTRUMENT`, existing tokens, existing shell grammar, Romanian operator UI, no second visual system.

Personality changes rhythm, density, and dominant spatial idea. It does not change Product Truth.

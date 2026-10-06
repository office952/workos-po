# WorkOS visual language canon V1

Status: OWNER-DIRECTED VISUAL CANON
Applies to: future WorkOS UI/UX work unless a later explicit Owner decision changes it.

## Core identity

```text
INDUSTRIAL HARDWARE. FUTURE INTELLIGENCE.
```

WorkOS should feel like an existing workshop, factory, or production floor that has acquired an unusually advanced operating system.

The physical world may be old, heavy, mechanical, repaired, reused, imperfect, or visibly industrial. The intelligence layered over it is precise, calm, fast, legible, and advanced.

The future is communicated through capability, orchestration, instrumentation, and control — not through decorative science-fiction effects.

## Balance

```text
REAL INDUSTRIAL = 70%
FUTURE INTELLIGENCE = 30%
```

This ratio is a design discipline, not a literal visual measurement.

Prefer:
- believable machinery, production context, tooling, cables, work areas, materials, bays, rails, controls, and technical labeling;
- advanced system awareness, status, routing, capacity, readiness, sequence, power, signal, timing, and decision support;
- interfaces that feel engineered for real work.

Avoid:
- generic SaaS dashboard styling;
- card soup;
- glossy consumer electronics;
- cyberpunk neon as decoration;
- gaming HUDs;
- fake military cosplay;
- fake dirt, scratches, rivets, or distressed textures used only for atmosphere;
- "retro" ornament that reduces readability;
- visual complexity that does not explain a real state or relationship.

## The WorkOS metaphor

A machine can look old and still have extraordinary capability.

A WorkOS surface should create the same impression:

```text
OLD / REAL / INDUSTRIAL HARDWARE
+
ADVANCED ORCHESTRATION
=
WORKOS
```

The operator should feel that WorkOS understands the workshop as a connected technical system.

Examples of valid visual relationships:
- machine -> capability -> current job -> load -> next operation;
- PSU -> power path -> illuminated sign;
- remote -> wireless signal -> controller;
- request -> readiness -> configuration -> offer;
- plan -> workcenter -> operator -> execution reality.

The relationship must be true before it is visualized.

## Dark and light

Dark and light are the same product, not separate design systems.

### Dark

```text
DARK = COMMAND ROOM / NIGHT SHIFT
```

Dark is the strongest expression of the WorkOS identity:
- deep technical surfaces;
- restrained luminous states;
- precise lines;
- controlled contrast;
- functional emission;
- strong equipment/instrument character.

### Light

```text
LIGHT = ENGINEERING FLOOR / DAYLIGHT PRECISION
```

Light preserves the same geometry, hierarchy, and technical character while recalibrating contrast:
- technical whites and warm-neutral light surfaces rather than featureless pure white everywhere;
- strong enough ink for primary information;
- visible panel/surface separation;
- restrained grid and line work;
- active/inactive states must remain obvious;
- no washed-out controls.

Light must not become a generic office SaaS theme.

## Color

Color has a job.

Primary rules:
- neutral industrial surfaces carry structure;
- azure remains an interaction/action language where already established;
- amber/gold may express technical infrastructure, routing, power, attention, or WorkOS instrument character when semantically appropriate;
- green, cyan, red, violet, magenta, and other colors are used for real states, RGB/light control, warnings, readiness, signals, or domain meaning;
- status color must never be the only carrier of meaning.

```text
DECORATIVE_GRADIENTS = NO
FUNCTIONAL_COLOR = YES
FUNCTIONAL_EMISSION / GLOW = ALLOWED WHEN IT EXPLAINS A LIVE STATE
```

Do not turn every active state into a glow.

## Typography and information

The interface should combine:
- clear sans-serif hierarchy for operator reading;
- monospaced technical text for identifiers, measurements, channels, machine/status metadata, and instrumentation where useful.

Microcopy should feel like an operating system for production, not developer diagnostics.

Operator UI stays Romanian.
Internal codes, DTO names, hashes, raw service names, and debug vocabulary do not leak into normal operator surfaces.

## Surfaces, panels, and composition

Prefer the grammar of:
- instrument panels;
- technical bays;
- rails;
- workbenches;
- status strips;
- routing paths;
- master/detail workspaces;
- operational queues;
- calibrated tables/lists;
- schematic relationships.

Use cards only where a card is the right information object.

Do not wrap every section in a floating rectangle.

A panel should usually answer at least one of:
- what is this;
- what state is it in;
- what can I do;
- what is connected to it;
- what happens next.

## Lists, tables, and operational queues

High-volume surfaces such as Cereri, Oferte, Lucrari, Atelier, and Planificare should optimize for scanning and action.

They should feel like operational consoles, not CRM templates.

Prefer:
- clear row hierarchy;
- restrained density;
- meaningful status indicators;
- age / urgency / ownership / readiness visible where relevant;
- one obvious primary action per state;
- filters that behave like controls, not decorative chips;
- detail-on-demand rather than showing every field at once.

## Status language

Status presentation should feel like system state.

Good patterns:
- READY
- ACTIVE
- WAIT
- BLOCKED
- REVIEW
- SERVICE
- COMPLETE

Romanian operator-facing wording is required where these states appear in the product.

Avoid candy-badge styling and excessive pill shapes.

Status must be understandable without color alone.

## Motion

Motion exists to explain state or flow.

Valid examples:
- calibration;
- scan;
- power flow;
- wireless link;
- routing;
- loading/progress;
- state transition;
- verification;
- machine/operation activity.

Invalid examples:
- continuous decorative motion with no state meaning;
- attention-grabbing animation behind primary work;
- motion that competes with login, forms, or operational reading.

All repeated/non-essential animation must respect `prefers-reduced-motion`.

## Responsive rule

```text
THE NARROWER THE SCREEN, THE FEWER SECONDARY DETAILS WE KEEP.
```

Do not preserve desktop complexity by shrinking it into illegibility.

Priority by width:
- large desktop: full technical story and high detail;
- laptop: preserve composition, remove secondary metadata first;
- tablet: brand + function + essential technical context;
- phone: task-first, identity, essential controls only.

A detail that only fits by becoming unreadable should be removed or simplified.

## Product task beats spectacle

Every surface has a primary job.

The WorkOS identity may enrich that job, but must not obscure it.

Examples:
- Login: authentication first, showcase second;
- Cereri: understand and act on incoming work first;
- Configurator: define Product Truth first;
- Atelier: execute work first;
- Planning: understand load and make a scheduling decision first.

```text
FUNCTION FIRST
IDENTITY ALWAYS
SPECTACLE ONLY WHEN IT HELPS
```

## Requests / Cereri as the first post-login pilot

Cereri de oferta is the first major post-login surface to apply this canon deliberately.

The page should answer quickly:
- what arrived;
- which client;
- what is being requested;
- how old/urgent it is;
- who owns it;
- whether it is blocked;
- whether it is ready for configuration / offer work;
- what needs attention now.

It should establish the post-login WorkOS language for:
- page header;
- operational list;
- filtering;
- search;
- status;
- selection;
- detail-on-demand;
- responsive reduction;
- dark/light parity.

Do not invent business states that do not exist in Product Truth/API contracts.

## Relationship to Figma and runtime

Authority order for presentation decisions:

```text
1. explicit Owner decision
2. this visual-language canon
3. Owner-accepted Figma authority for surfaces/nodes it actually covers
4. implemented runtime as behavior/evidence
5. historical UI as reference only
```

Protected Figma nodes remain protected. This document does not authorize silently rewriting accepted Figma surfaces.

For new or materially redesigned surfaces, the visual language in this canon must be applied when creating the next accepted design/runtime proof.

## Acceptance question

A WorkOS screen is not visually complete only because it is modern, clean, responsive, or technically correct.

Ask:

> Does this look like real industrial work being understood and orchestrated by intelligence from the future?

If the answer is no, the surface has not yet reached the WorkOS character.

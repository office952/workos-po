# Figma authority

```text
STATUS = RETIRED / HISTORICAL ONLY
CURRENT_UIUX_AUTHORITY = docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md
```

Owner decision, 2026-10-16: Figma is not the UI/UX authority for WorkOS. This file keeps the provenance of `WorkOs-F`. It is not a gate, a fidelity source, or a blocker for design, implementation, or review. Do not appoint another Figma file in its place.

The sections below are the historical record. They do not authorize current visual work.

```text
FIGMA_FILE = WorkOs-F
FIGMA_FILE_KEY = M3Klzg7sulrtLSyxJBf3Vd
HISTORICAL_RECORD = YES
```

## Protected visual authorities

| Role | Node |
| --- | --- |
| PRIMARY_PRODUCT_CONFIG_SOURCE | `1:8520` |
| COLOR_AUTHORITY | `1:17238` |
| BRAND_AUTHORITY | `1:17039` |

## Accepted UI Foundation V1

```text
FOUNDATION_ACCEPTED =
12:6
12:225
12:579
15:4
```

## Historical missing node

```text
MISSING_COMPONENT_SYSTEM = 1:19519
STATUS = MISSING
```

**DO NOT RECREATE `1:19519`.**

Protected source nodes must not be silently reinterpreted.

## Evidence vs authority

Current runtime captures are evidence, not automatic design authority.

Existing WorkOS UI is reference / behavioral evidence. It is not the required visual migration base.

## Historical product character

The names below are provenance. They are not current visual requirements.

```text
CALM INSTRUMENT
INDUSTRIAL HARDWARE. FUTURE INTELLIGENCE.
REAL INDUSTRIAL = 70%
FUTURE INTELLIGENCE = 30%
HISTORICAL_ONLY = YES
```

`docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md` is superseded.
Stylesheet ownership remains `docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md`.

Historical notes, not current requirements:

Dark was described as the command-room / night-shift expression.
Light was described as the same machine in engineering-floor / daylight precision.

Azure was reserved for action. That reservation is retired. Technical amber/gold was an optional historical accent, not a current obligation.

Avoid:

- generic SaaS dashboard
- card soup
- decorative dashboards
- cyberpunk neon used only as decoration
- fake industrial grime / cosplay
- unnecessary gradients
- arbitrary component-library replacement

## Historical hierarchy

The order below described the retired Figma-led process. Current decisions follow `docs/architecture/WORKOS_UIUX_AUTHORITY_CURRENT.md`.

```text
HISTORICAL_ORDER =
1. explicit Owner decision
2. WORKOS_VISUAL_LANGUAGE_CANON_V1
3. Owner-accepted Figma nodes for the surfaces they actually covered
4. runtime captures as behavior/evidence
5. historical UI as reference only
```

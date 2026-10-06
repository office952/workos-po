# Figma authority

```text
FIGMA_FILE = WorkOs-F
FIGMA_FILE_KEY = M3Klzg7sulrtLSyxJBf3Vd
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

## Product character

```text
CALM INSTRUMENT
INDUSTRIAL HARDWARE. FUTURE INTELLIGENCE.
REAL INDUSTRIAL = 70%
FUTURE INTELLIGENCE = 30%
```

The visual-language authority for future WorkOS surfaces is:
`docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md`.

The styling-ownership authority is:
`docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md`.

Dark is the command-room / night-shift expression.
Light is the same machine in engineering-floor / daylight precision.

Azure remains for **ACTION / INTERACTION** where already established. Technical amber/gold may express real infrastructure, routing, power, attention, or instrument character when semantically justified.

Avoid:

- generic SaaS dashboard
- card soup
- decorative dashboards
- cyberpunk neon used only as decoration
- fake industrial grime / cosplay
- unnecessary gradients
- arbitrary component-library replacement

## Authority hierarchy for future presentation work

```text
1. explicit Owner decision
2. WORKOS_VISUAL_LANGUAGE_CANON_V1
3. Owner-accepted Figma nodes for the surfaces they actually cover
4. runtime captures as behavior/evidence
5. historical UI as reference only
```

Protected source nodes remain protected. This hierarchy does not authorize silently rewriting an accepted Figma surface. It defines how new or materially redesigned surfaces acquire the current WorkOS character.

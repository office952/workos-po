# Visual anti-slop

Visual design intelligence only.

Do **not** merge this with code-hygiene deslop tooling.

## Detect and question

- card for every concept
- nested card soup
- uniform dashboard grids everywhere
- every state represented as a pill
- equal visual weight everywhere
- excessive borders
- arbitrary gradients
- icons without semantic value
- giant headings wasting operational space
- everything centered
- empty whitespace without purpose
- controls separated from the content they affect
- repeated decorative metadata
- generic SaaS dashboard composition

Detection is not an automatic ban.

Ask: does this pattern help the page's real job?

If yes, keep it and say why.
If no, remove or quiet it.

## Distinctiveness

```text
SPEND DISTINCTIVENESS DELIBERATELY.
```

Each important WorkOS surface may have one dominant product-specific spatial idea.
Let the rest support it.
Avoid visual theatrics across every element.

Examples of a dominant idea (intents, not new routes):

- Catalog: choose a product into a known job
- Ofertă: commercial clarity of a frozen record
- Lucrare: continuity of one job
- Atelier: dense actionable work
- Execuție: focus and minimum ambiguity

Do not invent a new visual language per page. One WorkOS language. One dominant idea per important surface.

## WorkOS-specific false friends

- Azure used as a status color — Azure is ACTION / INTERACTION (`docs/FIGMA_AUTHORITY.md`)
- Workflow color competing with the action / CTA
- A runtime screenshot treated as the design to copy
- Substituting a component library, shadcn, 21st.dev, or Radix program for WorkOS primitives
- Recreating missing Figma node `1:19519`

## What this file is not

Not a linter.
Not a token sheet.
Not permission to restyle the shell or rewrite `src/styles/tokens.css`.

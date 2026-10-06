# UIUX-1 shell foundations

Status: implemented, pending independent review. This note records the presentation contract for later UIUX waves. It does not change Product Truth.

## Global navigation

L1 is stable and grouped:

- Comercial: Clienți, Cereri, Catalog, Oferte
- Operațiuni: Lucrări, Planificare, Atelier
- Administrare: one entry, `/admin`

Configurator, ansamblu, and execution stay reachable from the work that opens them. They are not extra L1 items. Planificare is an L1 destination. The same destinations are not repeated in a second global sidebar.

`/` is the launchpad. It is not rewritten to `/clienti`. A `/` URL that already carries customer, request, or product context still opens the configurator.

## Floorplans

Shared pages use one of:

`authentication`, `launchpad`, `list-report`, `object-detail`, `master-detail`, `form-configuration`, `admin-settings`, `operational-workspace`.

The attribute is `data-floorplan`. Existing workspace classes remain the layout implementation.

## Administration

`/admin` is the settings orientation. Child pages keep one grouped L2 rail:

- Organizație
- Comercial și calcul
- Execuție

The active L1 state follows any `/admin` path. It is not tied to `/admin/resources`.

## Appearance

The shell stores `workos-color-scheme` as `light`, `dark`, or `system`. Tokens switch through `data-resolved-theme`.

## Deferred wording

These operator strings stay for a later wave:

- UIUX-2: configurator copy that names the product engine
- UIUX-3: job detail copy that names the execution engine; foundation proof copy that names the API contract
- UIUX-4: admin page copy that says "Owner" instead of proprietar; deep admin page structure
- UIUX-5: final global polish beyond this shell


## Visual language evolution

The accepted shell remains valid. Future surface work now follows:

- `docs/architecture/WORKOS_VISUAL_LANGUAGE_CANON_V1.md`
- `docs/architecture/WORKOS_UI_STYLE_ARCHITECTURE_V1.md`

The shell should read as a calm industrial operating system: real production context with advanced orchestration, not a generic SaaS dashboard.

Dark and light remain one system. Responsive behavior follows progressive detail reduction: remove secondary instrumentation before compressing the operator's primary task into illegibility.

Cereri de oferta is the first post-login surface designated to apply this visual language and modular stylesheet ownership deliberately.

`src/styles/ui.css` remains historical/shared runtime code. New major surfaces do not use it as their default styling destination.

# WorkOS pilot readiness — synthetic runbook V1 (N-029)

Status: **synthetic only**. It does not authorize a real organization, real Cloud, a real database, deployment or cutover. Gate A and Gate B stay HOLD ([gate](PILOT_READINESS_GATE_V1.md)).

This runbook describes how a new company is brought from nothing to a finished job in WorkOS, using the persistent synthetic environment **N-029** and the automated journey `e2e/pilot/`. Every step names the surface it runs on:

- **UI**: the operator does it in the WorkOS browser interface.
- **API**: available only through an API route, with no screen (not a normal customer workflow).
- **CLI**: a platform-operator command (controlled, not self-service).
- `ADMIN_TOOLING_DEBT`: a normal company need that today requires CLI/API instead of UI.

## 1. Environment N-029

```text
ROOT (default)   = %LOCALAPPDATA%\WorkOS\N-029_PILOT_READINESS_E2E   (outside Git)
MARKER           = PILOT_E2E_N029 (root) · --workos-pilot-e2e-n029 (process)
API + UI         = one process, http://127.0.0.1:8895 (API serves the built dist/)
FLAGS            = NODE_ENV=development, WORKOS_ORG_ROLES_V1=on (N-029 only)
SECRETS          = <root>\pilot-e2e-secrets.json (generated locally, never printed, never in Git)
LEDGER           = <root>\pilot-e2e-ledger.json (bootstrap, start, stop, backup, restore)
```

Commands (from the repository root; `pnpm build` first so `dist/` exists):

```bash
node scripts/pilot-e2e.mjs init
```

```bash
node scripts/pilot-e2e.mjs schema
```

```bash
node scripts/pilot-e2e.mjs start
```

```bash
node scripts/pilot-e2e.mjs status
```

```bash
node scripts/pilot-e2e.mjs stop
```

Guards (enforced before any action, covered by `scripts/pilot-e2e.test.mjs`):

- the root must not be inside a repository or worktree, must not equal `WORKOS_CLOUD_ROOT`, `WORKOS_LOCAL_ROOT` or `WORKOS_DEMO_ATELIER_ROOT`, and must not be named like N-019, N-020, N-028 or `demo-alpha`;
- temporary directories are refused unless `WORKOS_PILOT_E2E_ALLOW_TEMP=1` (CI only);
- `init` runs only on a missing or empty directory: it never reuses, migrates or repairs an existing root;
- every other command requires the N-029 marker and refuses roots carrying a foreign marker (N-019 demo, Synthetic Reference);
- `NODE_ENV=production` is refused;
- the launcher only stops a process it can positively identify (recorded pid + root + port + process marker).

Migrations: the API applies the repository migrations to the **new** N-029 databases when it creates them (control 001–003, organization plane 001–052). No historical or real environment is opened. `schema` reads both `schema_migrations` ledgers read-only and compares them with the repository.

## 2. Company setup — who does what, where

| # | Step | Actor | Surface | Notes |
| --- | --- | --- | --- | --- |
| 1 | Create organization "WORKOS PILOT DEMO SRL" with its isolated plane and first owner | Platform operator | **CLI** `pnpm --filter @workos-final/api cloud:provision-organization -- --intent NEW_ORGANIZATION --confirm-controlled-provision --password-stdin` | Controlled bootstrap; password on stdin; done by `init` |
| 2 | Owner signs in | Proprietar | UI `/` | — |
| 3 | Choose offered products | Proprietar | UI `/admin/products` | Versioned save with review |
| 4 | Commercial policy (markup, VAT) | Proprietar | UI `/admin/commercial` | Versioned |
| 5 | Confirm material/operation costs and create the workshop labor rate | Proprietar | UI `/admin/resources` | A new organization starts with platform-default, **unconfirmed** rates |
| 6 | Work centers, machines, capabilities | Proprietar | UI `/admin/workcenters` | — |
| 7 | People, skills and operator PIN | Proprietar | UI `/admin/people` | PIN generated locally, kept in the secrets file |
| 8 | Invite Comercial, Producție, Atelier | Proprietar → invitee | UI `/admin/access` (one-time link) → invitee sets own password | Requires `WORKOS_ORG_ROLES_V1=on`; off by default on main |
| 9 | Seller legal name on offers | Proprietar | UI configurator → "Pregătire ofertă" | Fiscal id, brand, locality: **API** only (`ADMIN_TOOLING_DEBT`); bank details not modelled |
| 10 | Revoke a member, close other sessions | Proprietar / user | UI `/admin/access`, account security | — |
| 11 | Second organization (B) and a user in both | Platform operator (B bootstrap) + owner B in UI | **CLI** for B's first owner; UI invitation for the shared user | One person, two roles in two organizations |
| 12 | Optional capabilities (Materials, external production) | Proprietar | UI `/admin/material-readiness`, `/admin/external-production` | Default DISABLED; the journey activates Materials later and proves job history unchanged; external production is only checked as DISABLED |

## 3. Business journey (all UI)

| Stage | Role | Screen |
| --- | --- | --- |
| Client and request | Comercial | `/cereri/noua` ("Adaugă client rapid", product choice) |
| Configuration | Comercial | configurator inside the request (server schema) |
| Manual price and frozen quote | **Proprietar** | configurator → "Confirmă prețul" → "Îngheață oferta" (Comercial cannot: `prices.manual.set` is owner-only, pre-V1 rule) |
| Quote PDF | Proprietar / Comercial | quote page (document route) |
| Customer acceptance → job | Proprietar | quote → "Confirmă comanda" |
| Production release and plan | Producție | job sheet → "Trimite în producție" |
| Execution (operator identified by PIN) | Atelier | `/atelier` → operation → start/finish, observations, issue |
| QC | Atelier | QC operation → note → "Acceptă" |
| Issue handling | Producție | "Preia problema" → "Marchează rezolvată" |
| Finalization, planned vs actual | Proprietar / Producție | job sheet; actual internal cost is computed by the engine (owner scope) but **not shown in the UI** (`PVA_COST_NOT_IN_UI`) |

## 4. Restart, backup and restore (N-029 only)

1. `stop` → `start`: every fact (members, people, work centers, jobs, tasks, issues, audit events, policy version) is re-read through the API and compared (`--steps persistence`).
2. Quiesced backup: `stop`, then `node scripts/pilot-e2e.mjs backup` (refused while the API listens).
3. Restore into a **new, empty, separate** root: `node scripts/pilot-e2e.mjs restore --backup <backup dir> --target <new root>`; the source root is refused as a target.
4. Start the restored copy on another port (`start --root <new root> --port 8897`) and run `--steps restored` (data, audit and a representative new request).
5. Restart the original and re-run `--steps persistence` to prove the original is unchanged.

## 5. Automated journey

```bash
node e2e/pilot/pilot-journey.mjs --base http://127.0.0.1:8895 --root <root> --evidence <evidence dir>
```

- Steps are idempotent per root (`pilot-e2e-state.json`); `--steps a,b` re-runs chosen steps.
- Each capture passes a secret guard (no password, PIN, token or one-time link visible or in an unmasked field).
- CI runs the same chain on a fresh temporary root with `node scripts/pilot-e2e-ci.mjs` (job "Pilot Readiness E2E (synthetic)"), with no dependency on N-029, on any Owner runtime or on real Cloud.

## 6. Known debt and limits

| Item | Classification |
| --- | --- |
| Seller fiscal id, brand, locality only through **API** `PATCH /api/seller` (UI: legal name only); bank details not modelled | `ADMIN_TOOLING_DEBT` (bank: product decision) |
| First owner of a new organization only through CLI | Controlled pilot by design (no public signup) |
| Comercial cannot set a manual price or freeze a quote | Existing permission rule; changing it needs an Owner decision |
| Actual internal cost not presented in the UI | Presentation gap; engine value exists (PARTIAL when evidence is incomplete) |
| Skill label "Ansamblare" | Minor UX text |
| Online backup under writes | Not supported (quiesced only) |
| Assembly products (ACM + letters) | Not part of this journey; letters product only |

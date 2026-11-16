# WorkOS controlled pilot readiness gate V1

Status: **preparation only; not a production or real-data authorization**.

Tracking: [Controlled pilot roadmap](https://github.com/office952/workos-po/issues/55).
Original baseline: `main` after PR #54, merge commit `af15729064dbe8ae2bb1f433b28460457b651173`.
PILOT-0 reconciled baseline: `main` after PR #69, merge commit `eb3f3c4915e6c18cad91ac613af55fdde934459c`; WorkOS Verify succeeded on that push.
Current baseline (Pilot Readiness E2E V1, 2026-11-16): `main` `bc5c7787565f019b9f1bb3060927659c6c2b9f2a` (PR #134 merge). Gate A and Gate B remain **HOLD**; see [Pilot Readiness E2E V1](#pilot-readiness-e2e-v1-synthetic-2026-11-16) below.

## Evidence classification

| Evidence | Current meaning |
| --- | --- |
| PR #54 integrated on `main` | Source integration complete, not production release |
| PR #56–#61, #64, #66–#69 integrated on `main` | Source integration complete; Owner acceptance **not recorded** for these PRs |
| WorkOS Verify succeeded on `eb3f3c4` (push) | Automated code checks green on current `main` |
| ACM + letters 17/17, final QC, packing, job completed | Synthetic browser journey on earlier feature commit `fc94169`; no real organization |
| Real-environment `pnpm pilot:preflight` | **NOT RUN** |
| Backup/restore | Automated synthetic tests pass. Operator drill executed once on new synthetic roots at `eb3f3c4` (PILOT-0): PASS, Owner acceptance pending — [evidence](PILOT_0_SYNTHETIC_RECOVERY_DRILL_EVIDENCE_V1.md). No real operating-environment drill |
| Deploy / rollback / incident STOP procedure | Template only — [runbook](PILOT_DEPLOY_ROLLBACK_INCIDENT_RUNBOOK_V1.md); not executed, not accepted |
| Pilot Readiness E2E V1 (N-029 + CI job) | Synthetic browser chain from a new company to a finished job, 4 roles + multi-organization user, isolation, restart, backup/restore into a separate root — [runbook](PILOT_SYNTHETIC_RUNBOOK_V1.md). Synthetic only; not real-environment acceptance |
| First real customer or production order | **NOT AUTHORIZED** |

Do not relabel a synthetic test, a green CI run, or a merged PR as real-environment acceptance. Reconfirm current `main` and required checks before making decisions.

## Delivery plan (separate PRs)

1. **Baseline and gates** — align the living roadmap and publish this evidence contract. No business logic or deployment.
2. **Readiness and security** — review current `pilot:preflight`, `/api/ready`, HTTPS/origin checks, organization isolation, operator and owner sessions, and plane/schema validation. Add isolated tests or narrow fixes only where evidence demonstrates a gap.
3. **Recovery drill** — prove API quiescence, backup, validation and restore to a **new synthetic root**. Online backup under writes is not supported.
4. **Admin and workflow readiness** — exercise existing provisioning CLIs in an authorized isolated environment; configure users, operators/PINs, work centers, machines, product enablement and pricing/resources using the supported UI. Record platform-only steps and operator friction. Full product-definition authoring and public signup are not prerequisites for the controlled pilot.
5. **Pilot acceptance** — collect environment-specific runbook, deployment rollback method, recovery evidence, security review, responsible operator and explicit Owner GO.

## Minimum GO/NO-GO checklist

- [ ] Candidate commit and `main` SHA recorded; no unexpected branch divergence.
- [ ] `pnpm verify:all` and required CI are green on the exact release candidate.
- [ ] HTTPS same-origin proxy, `WORKOS_PUBLIC_ORIGIN`, trusted origins and secure session cookies reviewed.
- [ ] Tenant isolation, role permissions and operator identification verified against the intended release.
- [ ] Control Plane and each active Operational Plane pass compatible identity/schema/readiness checks.
- [ ] **Separately authorized** real-environment read-only `pnpm pilot:preflight` exits 0 on the intended deployment root; no sensitive details are exported.
- [ ] Quiesced-offline backup procedure and restore into a different **non-production** root are proved; recovery ownership and restart steps documented.
- [ ] The chosen organization, users, operator PINs, work centers, machines and enabled products are configured through documented supported operations, without ad-hoc SQL.
- [ ] Pilot Owner reviews actual browser flows, including quote freeze, work release, execution, QC and finalization, in the intended environment.
- [ ] Rollback and incident STOP procedure exists.
- [ ] Explicit Owner authorization for deploy, real Cloud operations and first real job is obtained **separately**.

**NO-GO** if any required check fails, is missing evidence, or is not authorized. A green `pilot:preflight` does not authorize deploy automatically.

## PILOT-0 readiness matrix (`main` `eb3f3c4`, 2026-10-13)

`pnpm pilot:preflight` inspects infrastructure only (environment, roots, HTTPS origin, builds, planes, lease, backup support). A green infrastructure preflight is not business readiness.

### Gate A — real-environment read-only preflight

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Exact target environment identified | **MISSING** | No host, proxy/TLS owner, public origin, Cloud root or backup root recorded (correctly kept outside Git; the Owner has not supplied them) |
| Owner authorization for that target | **MISSING** | Not given; PILOT-0 explicitly excludes it |
| Environment operator identified | **MISSING** | Not named |
| Safe read-only preflight procedure | READY | `pnpm pilot:preflight --json` is read-only ([production runtime](PRODUCTION_RUNTIME.md#pilot-preflight)); runbook sections 2 and 8 |
| Expected checks and STOP conditions | READY | Exit 0/2/3 contract; runbook section 2; STOP list in [organization setup](PILOT_ORGANIZATION_SETUP_V1.md#stop-and-escalation) |

**Gate A verdict: HOLD** until the Owner names the target and operator and authorizes the read-only preflight.

### Gate B — controlled pilot activation

| Requirement | Status | Evidence / gap |
| --- | --- | --- |
| Gate A passed | NOT_RUN | — |
| Synthetic recovery drill passed | PASS (synthetic), **Owner acceptance pending** | [drill evidence](PILOT_0_SYNTHETIC_RECOVERY_DRILL_EVIDENCE_V1.md) |
| Deploy/rollback runbook accepted | **TEMPLATE ONLY** | [runbook](PILOT_DEPLOY_ROLLBACK_INCIDENT_RUNBOOK_V1.md); artifact form and host stop mechanism undecided |
| Backup responsibility assigned | **MISSING** | Operator, cadence and downtime window not decided |
| Operator access controlled | PARTIAL | Server sessions, origin checks, membership and owner-write enforcement proven synthetically; no MFA or password recovery (advisory for a controlled pilot) |
| Pilot organization configured with Owner-confirmed rates | **MISSING** | Not provisioned. A new organization starts with platform-default rates marked unconfirmed; they are calculable, so each must be reviewed before a real quote |
| Product and provider readiness | NOT_RUN | Enablement, people/PINs, work centers, machines and providers not configured for a real organization |
| Explicit first-real-job authorization | **NOT AUTHORIZED** | — |

**Gate B verdict: HOLD.**

### Assembly scope

Assemblies (ACM panel with mounted letters/logo) are **excluded from cost-complete pilot claims** unless every assembly-level operation is costed. Their selling price is unaffected.

Later status (2026-11-16): the assembly quote PDF is integrated (PR #71). V4 Assembly Production EIC is integrated (PR #76, `bdf6904`, migration 041): assembly-level operations are costed from the organization's assembly operation cost policy and the workshop labor rate frozen into the quote; any gap stays `PARTIAL`, never zero. The table below is the PILOT-0 record of what was missing then; the remaining requirement is an Owner-confirmed policy and labor rate per organization. The Pilot Readiness E2E V1 journey uses the letters product, not an assembly.

PILOT-0 record of missing evidence (no rates, formulas or quantity bases invented):

| Operation | Missing |
| --- | --- |
| `MOUNT_LETTERS_ON_PANEL` / `MOUNT_LOGO_ON_PANEL` | LABOR cost recipe, labor resource and Owner-confirmed rate, Owner-decided assembly-level quantity basis |
| `INSPECT_FINISHED_ASSEMBLY` | Owner decision whether it is costed at all (standalone product inspection is not costed); if costed, recipe, basis and rate |
| `PACK_PRODUCT` at assembly level | Owner decision which area basis applies to an assembly and whether the existing per-m² packing rate applies; organization-confirmed rate |

PILOT-0 note, superseded by V4: `reconcileAssemblyEic` (`packages/domain/src/assembly/eic.ts`) then treated every assembly-level production operation as unpriced. Since V4 it prices them from the operation evidence frozen in the order and leaves them unpriced (`PARTIAL`) only when that evidence is missing.

## Pilot Readiness E2E V1 (synthetic, 2026-11-16)

Scope: one coherent synthetic wave on `main` `bc5c778`. No real Cloud, real database, deployment, cutover or Figma write. N-019, N-020, N-028 and the V1 demo were not touched.

| Area | Result | Surface |
| --- | --- | --- |
| Persistent environment N-029 | New root outside Git, control plane + 2 organization planes, schema 003 / 052 matching the repository, guards tested | `scripts/pilot-e2e.mjs`, `scripts/pilot-e2e.test.mjs` |
| Browser chain | AUTH → organization setup → client → request → configurator → quote → acceptance → job → release → plan → atelier → execution → QC → finalization → planned vs actual | `e2e/pilot/` |
| Roles | Proprietar, Comercial, Producție, Atelier; navigation and endpoint checks; user in two organizations with different roles | UI + API checks |
| Security | Invalid invitation, revoked user, closed sessions (401), organization isolation (404) | UI + API checks |
| Modularity | Simple company B without people or machines reaches an accepted job; Materials activated later without changing job history; external production DISABLED | UI + API checks |
| Restart, backup, restore | Facts identical after restart; quiesced backup; restore into a separate new root; restored copy usable; original unchanged | launcher + journey |
| CI | Job "Pilot Readiness E2E (synthetic)" runs the same chain on a fresh temporary root | `.github/workflows/workos-verify.yml` |

Findings recorded without changing business rules: Comercial cannot set a manual price or freeze a quote (`prices.manual.set` owner-only); seller fiscal id, brand and locality only through the API and bank details not modelled (`ADMIN_TOOLING_DEBT`); actual internal cost is computed but not displayed (`PVA_COST_NOT_IN_UI`); skill label "Ansamblare".

This is synthetic readiness evidence. It does not change Gate A or Gate B.

## Controlled pilot vs public SaaS launch

Controlled pilot may use platform-operator CLIs for organization and initial user provisioning, plus existing admin UI. Lack of public self-service signup, billing, password recovery, or MFA is not automatically a controlled-pilot blocker; document compensating controls and exposure. Reassess these before unrestricted public launch.

Customer display-name homonyms are currently allowed; CUI detection and unambiguous ID selection matter during pilot setup. Do not infer cross-tenant leakage from two synthetic customer records with the same name.

## Operational boundaries

- Production topology remains one Node API process, HTTPS same-origin, SQLite Control Plane and per-organization Operational Planes.
- Cloud root and backups live outside Git; no customer-specific forks or parallel Product Truth engines.
- Quiesced backup: stop API → prove stopped → backup → validate → restart. Never run a backup assuming concurrent writes are safe.
- Real environments, migrations, provisioning, resets, database writes, deployment and first real work require separately scoped Owner approval.
- Use isolated feature branches, one implementation writer, tests, PR review and explicit merge approval. No automatic main merge.

## Report contract for each gate

Record: `BASE_SHA`, `CANDIDATE_SHA`, `SCOPE`, `CHECKS`, `EVIDENCE`, `CONFIRMED_BLOCKERS`, `ADVISORIES`, `REAL_DATA_TOUCHED=NO/YES`, `OWNER_GO_REQUIRED`, `RECOMMENDATION=GO/HOLD`.

Avoid storing passwords, PINs, tokens, cookies, real organization IDs, or filesystem secrets in evidence.

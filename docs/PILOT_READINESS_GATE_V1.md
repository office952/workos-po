# WorkOS controlled pilot readiness gate V1

Status: **preparation only; not a production or real-data authorization**.

Tracking: [Controlled pilot roadmap](https://github.com/office952/workos-po/issues/55).
Baseline: `main` after PR #54, merge commit `af15729064dbe8ae2bb1f433b28460457b651173`.

## Evidence classification

| Evidence | Current meaning |
| --- | --- |
| PR #54 integrated on `main` | Source integration complete, not production release |
| WorkOS Verify #290 succeeded on PR head | Automated code checks succeeded on reviewed candidate |
| ACM + letters 17/17, final QC, packing, job completed | Synthetic browser journey on earlier feature commit `fc94169`; no real organization |
| Real-environment `pnpm pilot:preflight` | **NOT RUN** |
| Backup/restore | Quiesced offline mechanism tested synthetically; no real operating-environment drill accepted |
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

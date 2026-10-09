# WorkOS controlled pilot — organization setup and acceptance V1

Tracks [controlled pilot readiness #55](https://github.com/office952/workos-po/issues/55).

**Status: preparation only. No real organization provisioned, no production Cloud inspected, and no real data touched.** This is not a self-service onboarding specification or a deployment authorization.

## Owner-facing principle

A controlled pilot may use documented **platform-operator** CLI actions to create the organization and initial Cloud users. Day-to-day staff workflows must be possible through WorkOS browser UI, with no Cursor, SQL manipulation or company-specific code fork. One SaaS business engine and one Product Truth apply to all organizations.

## Setup ownership / sequence

| Stage | Responsible actor | Existing supported surface | Evidence required |
| --- | --- | --- | --- |
| 1. Approve pilot target and security boundary | Owner + platform operator | Separately approved operations plan | Deployment target, authorized operator, change window, rollback owner; no paths/secrets stored in repo |
| 2. Inspect preflight readiness | Authorized platform operator | `pnpm pilot:preflight` (read-only) | Sanitized exit code/status on intended root; **not authorized to run on real environment yet** |
| 3. Provision organization | Authorized platform operator | `pnpm cloud:provision-organization` | Org created with correct ownership and isolated plane; only after explicit real-write GO |
| 4. Add initial Cloud users | Authorized platform operator | `pnpm cloud:add-organization-user` | Role/membership checks; never record credentials in PR |
| 5. Configure staff | Organization admin in browser | `/admin/people`, `/admin/people/:id` | Operator identity and PIN session usable without CLI |
| 6. Configure execution resources | Organization admin in browser | `/admin/workcenters`, machines | Relevant work centers/machines are available to execution; no invented capacities |
| 7. Enable product offering | Organization admin in browser | `/admin/products` | Correct enabled templates/assemblies, disabled state respected |
| 8. Configure commercial/technical resources | Organization admin in browser | `/admin/resources`, `/admin/commercial`, `/admin/technical`, `/admin/formulas` | Rates, quantities and formula versions explicitly reviewed and approved |
| 9. Validate customer/request journey | Owner + commercial | `/clienti`, `/cereri/noua`, `/configurator`, `/ansamblu`, `/oferte` | Correct customer selected by CUI/ID, confirmed product, quote freeze and stable snapshot |
| 10. Validate operations | Owner + workshop lead | `/lucrari`, `/atelier`, `/executie/:planId` | Release, machine/person assignment, actuals, QC, packing, completed customer history |

The routes above describe existing interfaces, not evidence that they have been accepted in an intended real environment.

## Preflight checklist before first real record

- [ ] Explicit Owner authorization covers the **exact** target and operation. No inherited approval from a prior synthetic test or merged PR.
- [ ] HTTPS same-origin deployment and session/origin security checked.
- [ ] `/api/ready` and authorized `pnpm pilot:preflight` both report acceptable state.
- [ ] Intended organization and administrator memberships correctly isolated from all other organizations.
- [ ] Org admin can log in, switch organizations safely where permitted, and use the browser without developer intervention.
- [ ] Operator role, PIN, work center and machine eligibility verified.
- [ ] Catalog/product enablement and commercial/technical settings verified with authorized business values. Do **not** reuse synthetic fixture prices as real pricing.
- [ ] One valid customer identity chosen unambiguously. Two equal display names are possible; match by CUI and stable customer ID, not name alone.
- [ ] Recovery procedure approved and synthetic restoration evidence accepted; rollback responsibilities documented.
- [ ] First real request/quote/job sequence explicitly approved by Owner.

## Minimal company vs advanced company

- **Basic organization:** few users/operators, manually managed work center, only enabled products; optional modules not required. No automatic finance/inventory workflows may silently become required.
- **Advanced organization:** richer machinery, components, providers and org-managed formulas; the same shared runtime and Product Truth. Additional resources must remain scoped to the organization.
- **Disabled or future-enabled capabilities:** hidden/unavailable options do not erase earlier accepted snapshots or require destructive migration. No manual SQL setup as a customer workflow.

## STOP and escalation

Stop provisioning or execution on missing proof of target identity, production Origin/HTTPS failure, invalid migration/plane identity, absent authorized backup procedure, uncertain customer record or commercial values, cross-org access, or stale accepted quote.

Do not bypass security checks, manually edit operational SQLite, mass-seed real organizations, clear lease files or recreate roots to resolve a readiness failure. Return an actionable blocker, affected surface, owner and minimal next action.

## Acceptance report

```text
REPOSITORY_MAIN_SHA =
ENVIRONMENT_CLASS = SYNTHETIC / STAGING / REAL
OWNER_GO_FOR_OPERATIONS = YES/NO
TARGET_IDENTITY_CONFIRMED = YES/NO
PREFLIGHT_STATUS = READY / BLOCKED / NOT_RUN
ORG_PROVISIONED = YES/NO/NOT_AUTHORIZED
USER_ACCESS_VALIDATED = YES/NO/NOT_RUN
PEOPLE_OPERATOR_PIN_VALIDATED = YES/NO/NOT_RUN
WORKCENTERS_MACHINES_VALIDATED = YES/NO/NOT_RUN
PRODUCT_ENABLEMENT_VALIDATED = YES/NO/NOT_RUN
COMMERCIAL_TECHNICAL_TRUTH_ACCEPTED = YES/NO/NOT_RUN
CUSTOMER_IDENTITY_UNAMBIGUOUS = YES/NO/NOT_RUN
FIRST_JOB_AUTHORIZED = YES/NO
BACKUP_RESTORE_EVIDENCE = PASS/FAIL/NOT_RUN
BLOCKERS =
DECISION = GO / HOLD
```

Do not commit authentication materials, personal data or real infrastructure paths to GitHub. The real pilot remains HOLD until every applicable gate is explicitly approved.

# One feature, one PR

Status: **OWNER-APPROVED** (2026-11-06).

This is the permanent delivery policy for `office952/workos-po`. It does not weaken Git identity gates, one-writer rules, synthetic-data isolation, Owner GOs, CI, or branch protection.

```text
ONE_FEATURE_ONE_PR_BY_DEFAULT = YES
INTERMEDIATE_COMMITS = YES
MICRO_PR_BY_DEFAULT = NO
EXCEPTION_REQUIRES_OWNER_GO = YES
```

## Rule

One coherent end-to-end business feature is implemented in one dedicated worktree and one feature branch.

Domain, API, persistence, UI, documentation and tests are **implementation stages**, not automatic PR boundaries.

- Create meaningful intermediate commits for review, debugging, progress verification and safe recovery.
- Push the dedicated feature branch when useful for independent inspection.
- Create **exactly one final PR** when the feature is E2E complete and independently reviewable.
- Do not open an intermediate PR just because one internal stage finished.

A separate PR is permitted only after explicit Owner approval based on a demonstrated technical risk or a genuinely independent delivery dependency (for example a high-risk migration, a tenancy/security cut, or an infrastructure change that cannot be reviewed in the same diff).

## What stays protected

Real Cloud or database mutation, production migration, merge, and deploy still need their own Owner GO. Dirty parent checkouts stay untouched. One implementation writer per mutable scope.

## Authority

Owner decision: [permanent delivery rule](https://app.notion.com/p/4108ea98e40f8149adbcda9c947b711d). GitHub remains the ordinary development record ([GITHUB_PRIMARY_TRACEABILITY_V1.md](./GITHUB_PRIMARY_TRACEABILITY_V1.md)).

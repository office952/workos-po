## WorkOS Notion journal gate

Notion Record ID: REPLACE_WITH_H_OR_N_OR_R_CODE
Notion Record URL: REPLACE_WITH_EXACT_RECORD_PAGE_URL
Owner GO: Replace with exact Owner authorization and relevant scope
Scope: Replace with the approved change and excluded areas
Evidence: Replace with tests, CI, runtime evidence, and known limitations
Authorization Mode: V1

## Checklist

- [ ] I verified that the referenced Notion record exists in the WorkOS implementation registry.
- [ ] The record matches this exact PR scope, impacted modules and Owner authorization.
- [ ] I logged required pre-work decisions and all substantive scope changes in Notion.
- [ ] No real Cloud/DB write, deploy, migration or merge is implied by this PR.
- [ ] I will update the implementation record and append a journal event after review/merge.
- [ ] V2 only: the Owner-signed authorization for this record is on protected `main`; this PR does not touch `docs/governance/authorizations/`; pending Notion sync is recorded in the wave ledger, not claimed as done.

Governance: [NOTION_JOURNAL_GATE_V1](https://github.com/office952/workos-po/blob/main/docs/governance/NOTION_JOURNAL_GATE_V1.md) · [NOTION_JOURNAL_GATE_V2](https://github.com/office952/workos-po/blob/main/docs/governance/NOTION_JOURNAL_GATE_V2.md) (applies only once on `main`)

**Replace the sample record ID/URL. Do not reuse N-006 for unrelated PRs.** Use `Authorization Mode: V2` only when V2 is active on `main` and a signed wave authorization exists.

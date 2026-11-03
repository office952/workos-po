# WorkOS GitHub-primary traceability

Status: **OWNER-APPROVED** (2026-11-03). This supersedes the 2026-10-14 rule that required a Notion implementation record before ordinary planning, edits, commits and pull requests.

This binds development traceability in `office952/workos-po`. It does not change Product Truth, pricing, deployment eligibility, customer runtime, security checks, CI, or branch protection.

## Rule

GitHub is the record for ordinary WorkOS development. A pull request carries:

- **Reason** — why the change exists
- **Scope** — what is in, and what stays out
- **Owner GO** — the authorization for this action
- **Tests** — what ran, and the result
- **Risks** — what can still go wrong
- **Evidence** — proof and known limits

Notion pages that already exist remain valid. Citing one is optional. A missing Notion record does not block ordinary implementation, a commit, or a pull request.

Missing Owner authorization stops the write and fails the pull request. A Notion page does not grant that authorization. A green test run does not authorize merge or deploy.

## Pull request fields

```text
Reason: <why this change exists>
Scope: <bounded change and exclusions>
Owner GO: <what the Owner authorized>
Tests: <checks and results>
Risks: <remaining risk or known limit>
Evidence: <proof and limits>
```

Optional. Include both lines, or neither:

```text
Notion Record ID: N-006
Notion Record URL: https://app.notion.com/p/<32-character-page-id>
```

The metadata check confirms that these fields are present and specific. It does not call Notion, and it does not prove live approval beyond the pull request text. Reviewers still read the authorization and the diff.

## What stays protected

Real database or Cloud mutation, migrations against real data, deploy, and merge still need their own Owner authorization. Security, permissions, snapshot integrity, synthetic and real data isolation, CI, and branch protection stay in force. Customer runtime must not depend on Notion.

If Notion is unavailable, continue ordinary work that is already traced in GitHub. Do not invent an Owner GO.

---
title: "feat: Add controlled organization user tooling"
date: 2026-09-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: owner-go
execution: code
---

# feat: Add controlled organization user tooling

## Goal Capsule

Platform operators need one controlled command that creates a new global Cloud user and attaches it to an existing organization, or attaches an existing active global Cloud user to another organization. Browser user creation stays unavailable. First-organization provisioning stays as it is.

Authority: current repository code, then `AGENTS.md`, then `docs/ROADMAP.md`, then this Owner GO. WorkOS product truth outranks Compound Engineering.

Stop conditions: no commit, push, pull request, CI, merge, real Cloud access, or real database write. Only isolated synthetic roots may be mutated.

## Product Contract

### Requirements

- R1. Command `pnpm cloud:add-organization-user` accepts `--root`, `--organization-id`, `--email`, `--role owner|member`, and `--confirm-controlled-access-change`.
- R2. A new global email requires a password from a hidden TTY prompt or `--password-stdin`. `--password` argv is rejected. The password is validated and hashed with the existing Cloud password mechanism.
- R3. An existing global email does not require a password, and the command must not overwrite, reset, or rehash credentials. Supplying `--password-stdin` for an existing user fails closed with no mutation.
- R4. Results are `CREATED_NEW_USER`, `ATTACHED_EXISTING_USER`, `ALREADY_MEMBER`, `REACTIVATED_MEMBERSHIP`, and `USER_DISABLED`.
- R5. Active membership in the target organization is not duplicated and its role is not changed.
- R6. A revoked target membership is reactivated in place, keeps its membership id, and takes the requested role.
- R7. A disabled global user fails closed: no attach, no reactivation, no password change, no second identity.
- R8. The target organization must exist and be `ACTIVE`. The mutation is Control Plane membership scope only.
- R9. `POST /api/admin/access/users` stays unregistered. `/admin/access` stays list and revoke. Last active Owner protection stays intact.
- R10. Output may include organization id, normalized email, role, and result kind. It must not include a password, hash, salt, token, session, or any other organization's membership.
- R11. Continuity docs record `ADDITIONAL_USER_OPERATOR_TOOLING_V1 = IMPLEMENTED_LOCAL_IN_REVIEW` and stop saying new-organization provisioning itself is blocked by this tooling. Deferred scope stays deferred.

### Scope Boundaries

In scope: Control Plane helper, CLI, shell-guard classification, synthetic tests, and the continuity lines above.

Out of scope: browser create, invitations, email verification, password recovery, MFA, billing, production cutover, Operational Plane changes, People records, and HUB MEDIA-specific behavior.

### Deferred to Follow-Up Work

Self-service signup, email workflows, credential recovery, and production provisioning UX remain deferred.

## Planning Contract

### Key Technical Decisions

- KTD1. Reuse `users` and `organization_memberships`. Do not add a second identity store.
- KTD2. `addMembership` rewrites the role of an existing row, so the new path must not call it for an `ACTIVE` membership. A new Control Plane read and revoked-only reactivation keep that behavior explicit.
- KTD3. Hash the password outside the write transaction. Insert the user and membership inside one immediate transaction. Re-read the email inside the transaction and never apply the new hash to a user that appeared concurrently.
- KTD4. Open the Control Plane only when its sqlite file already exists, so a bad root does not create an empty database.
- KTD5. Only `ACTIVE` organizations accept access administration. `PROVISIONING`, `FAILED_RETRYABLE`, and `DISABLED` fail closed.
- KTD6. `USER_DISABLED` is printed as an operator result and the process still fails. Other failures throw a code and do not print a success result.
- KTD7. Shell guard classifies `cloud:add-organization-user` as controlled Cloud administration.

### Assumptions

- Current membership lifecycle (`ACTIVE` | `REVOKED`, unique per user and organization) makes in-place reactivation safe. No second membership row is introduced.
- Existing-user password input is rejected rather than ignored, so a supplied password cannot be mistaken for a reset.

## Implementation Units

### U1. Control Plane membership helpers

**Goal:** Read any target membership and reactivate only a revoked row without touching credentials.

**Requirements:** R5, R6, R8

**Dependencies:** none

**Files:** `apps/api/src/cloud/controlPlane.ts`

**Approach:** Add an exact user-and-organization lookup and a revoked-only update that preserves `membership_id`. Leave `addMembership` behavior unchanged for existing provisioning.

**Test scenarios:** Covered with U3. Active lookup returns the existing row. Revoked reactivation keeps the id, sets the requested role, and leaves other organizations untouched.

**Verification:** Helper calls do not update `password_hash`, `password_salt`, or `kdf`.

### U2. Command behavior and CLI

**Goal:** Implement the controlled add-user command and its operator output.

**Requirements:** R1–R4, R7, R8, R10

**Dependencies:** U1

**Files:** `apps/api/src/cloud/addOrganizationUser.ts`, `apps/api/src/cloud/addOrganizationUserCli.ts`, `apps/api/package.json`, `package.json`, `.cursor/hooks/workos-shell-guard.mjs`

**Approach:** Resolve the organization before asking for a password. New users are validated, hashed, and inserted atomically with the membership. Existing active users only gain a target membership. Disabled users throw `user_disabled`. `--password` is rejected by the existing argv guard.

**Patterns to follow:** `apps/api/src/cloud/controlledProvisionCli.ts`, `apps/api/src/cloud/devProvisionCli.ts`, `apps/api/src/cloud/password.ts`

**Test scenarios:**

- Happy path: new member and new owner return `CREATED_NEW_USER` and can log in with the new password.
- Happy path: an active user with no target membership returns `ATTACHED_EXISTING_USER` and the previous password still verifies.
- Edge: same-organization active membership returns `ALREADY_MEMBER` and the stored role stays put.
- Edge: revoked membership returns `REACTIVATED_MEMBERSHIP` with the same membership id.
- Error: disabled user, missing organization, non-active organization, invalid role, missing confirmation, `--password` argv, and `--password-stdin` on an existing user all fail with no credential write.
- Integration: stdout and stderr for the success and rejection paths do not contain the password.

**Verification:** Synthetic root only. Process output is limited to the four allowed fields.

### U3. Proof and continuity

**Goal:** Lock the security and product boundaries with tests, and update continuity wording.

**Requirements:** R9, R11

**Dependencies:** U2

**Files:** `apps/api/tests/add-organization-user.test.ts`, `.cursor/hooks/workos-shell-guard.test.mjs`, `AGENTS.md`, `docs/ROADMAP.md`, `docs/PRODUCTION_RUNTIME.md`, `apps/api/src/cloud/organizationAccess.ts`

**Approach:** Prove browser create stays absent, first-owner provisioning and `NEW_ORGANIZATION` empty foundation stay intact, foreign memberships and People records stay unchanged, and the shell guard asks before the new command. Set the local review status without claiming Owner acceptance or integration on main.

**Test scenarios:**

- `POST /api/admin/access/users` stays 404. List and revoke still work. Revoking the last active Owner is rejected.
- A second organization attach does not change the first organization's membership rows or credential bytes.
- Provisioned People list stays empty and the provider foundation stays `EMPTY_FOUNDATION`.
- New command source does not introduce a HUB MEDIA seed or branch.
- Shell guard returns ask for `cloud:add-organization-user`.

**Verification:** Targeted API tests pass, then the repository validation gates in the Verification Contract.

## Verification Contract

Run the new API test and the shell-guard test first. Then run domain tests, API tests, root tests, domain typecheck, API typecheck, root typecheck, root lint, engine lint, build, and `git diff --check`. Use synthetic temporary Cloud roots only.

## Definition of Done

- The command implements R1–R10 on the existing Control Plane.
- Continuity docs match R11 and do not claim `OWNER_ACCEPTED` or `INTEGRATED_ON_MAIN`.
- Validation gates above pass.
- The worktree is not committed, pushed, or merged.

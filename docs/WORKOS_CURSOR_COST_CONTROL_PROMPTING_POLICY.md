# WorkOS Cursor Cost-Aware Prompting Policy

Owner-approved policy for cost-aware Cursor prompting on `office952/workos-po`.

Canonical Cursor enforcement: `.cursor/rules/workos-cost-aware-prompting.mdc`  
Complements: `AGENTS.md`, `.cursor/rules/research-on-demand.mdc`  
Does not authorize product-code changes, real Cloud/DB writes, or Owner-gate bypass.

## Core rule

All WorkOS Cursor prompts must be cost-aware by default. Expensive Agent loops and high-capability models are reserved for tasks where ambiguity, architectural risk, security risk, product-truth risk, or implementation complexity justifies them.

## Required prompt fields

For substantive WorkOS Cursor work, include:

| Field | Purpose |
| --- | --- |
| `MODE` | READ-ONLY / PLAN / DEBUG / AGENT |
| `COST PROFILE` | LOW / BALANCED / HIGH |
| `LOCATION + GIT IDENTITY GATE` | Prove workspace identity before work |
| `TASK` | One clear job |
| `ALLOWED SCOPE` | Exact files/modules where possible |
| `PERMISSIONS` | What is authorized |
| `ACCEPTANCE` | Done criteria |
| `STOP CONDITIONS` | When to halt |

## Default cost routing

### Class C / LOW

**Use for:** branch/status checks, location gates, file inventory, simple search, mechanical summaries, tiny deterministic copy/CSS/text changes.

**How:** Ask/read-only or low-cost Agent (Composer / Auto Cost). Minimal tools. No broad exploration. No high-cost models.

### Class B / BALANCED

**Use for:** approved implementation, focused UI work, tests, controlled refactors, feature slices with known scope.

**How:** Normal Agent with bounded files and acceptance criteria.

### Class A / HIGH

**Use for:** architecture, Product Truth, pricing/execution contracts, security, migrations, hard debugging, final synthesis, cross-module decisions.

**How:** Plan/Debug/high-reasoning only when needed. Escalate in a **new** chat after LOW/BALANCED checkpoints.

## Prompt construction rules

1. Keep location gates short. Do not paste the full WorkOS history into identity gates.
2. Prefer one task per chat/Agent.
3. Start a new chat/Agent after a completed checkpoint, runtime proof, commit, PR, or major decision.
4. Do not use mega-prompts when a short objective plus repo discovery is enough.
5. Do not attach large dossiers by default. Reference docs by filename and instruct the Agent to read only the relevant sections.
6. Limit exploration before implementation. Ask for a read-only plan first when scope is unclear.
7. Use one implementation writer by default.
8. Parallelize only read-only research or verification unless explicitly approved.
9. Do not activate MCP/plugins unless the lane requires them.
10. Do not use high-cost models for gate/setup/status/mechanical tasks.
11. For UI implementation, still require runtime/browser proof when relevant.
12. Preserve SaaS-only, one product truth, one business engine, synthetic-vs-real data separation, and explicit Owner gates.

## Mandatory minimal gate template

```text
MODE: READ-ONLY
COST PROFILE: LOW

Verify only Cursor workspace identity.

Report:
- cwd
- git toplevel
- origin
- branch/detached
- HEAD
- status short
- expected worktree match
- SAFE_TO_CONTINUE YES/NO

Do not read large files.
Do not implement.
Do not run tests.
Do not modify files.
```

## Implementation prompt template

```text
MODE: AGENT
COST PROFILE: BALANCED

Run the location gate first.
Then implement only the specified task.

Allowed scope:
- list exact files/modules where possible

Permissions:
IMPLEMENTATION = YES
COMMIT = NO unless explicitly requested
PUSH = NO unless explicitly requested
PR = NO unless explicitly requested
REAL_CLOUD_WRITE = NO
REAL_DB_WRITE = NO
MERGE = NO

Stop conditions:
- SAFE_TO_CONTINUE != YES
- target files already dirty with unrelated edits
- required scope expands outside allowed files/modules
- real cloud/db credentials or mutation would be required
- destructive Git would be required

Do not:
- reset/stash/checkout to fix identity
- modify unrelated files
- start parallel writers
- run broad refactors
- activate unnecessary MCP/plugins
```

## ChatGPT / prompt-author routing (optional header)

When generating Cursor prompts externally, prefix with:

```text
=== CURSOR_ROUTING ===
TIER: CHEAP | MID | EXPENSIVE
MODEL_HINT: Composer | Auto-Cost | Auto-Balance | frontier
CHAT: NEW_REQUIRED | CONTINUE_OK
SPLIT: GATE_ONLY | IMPLEMENT_ONLY | FULL
=== END_ROUTING ===
```

Map: CHEAP → Class C / LOW · MID → Class B / BALANCED · EXPENSIVE → Class A / HIGH.

Prefer two prompts (GATE then IMPLEMENT) over one mega-prompt.

## Relationship to repository authority

- `AGENTS.md` remains the WorkOS PO agent contract and product-boundary authority.
- This policy only constrains **how** Cursor work is prompted and routed for cost.
- No change to: one product repository, one business engine, presentation authority, Owner GO requirements, or real-environment holds.

# Repository boundary

The separation is absolute:

```text
workos-final != workos-po
workos-ui20 != workos-po
```

## Model

```text
┌──────────────────────────────┐
│      workos-po               │
│                              │
│ presentation                 │
│ interaction                  │
│ responsive UI                │
│ accessibility                │
│ presentation adapters        │
└───────────────┬──────────────┘
                │
                │ supported API contracts
                ▼
┌──────────────────────────────┐
│      workos-final            │
│                              │
│ domain                       │
│ backend/API                  │
│ persistence                  │
│ business truth               │
└──────────────────────────────┘
```

## Roles

| Repository | Role |
| --- | --- |
| `office952/workos-final` | Business engine, current runtime, domain authority, API authority, database authority, Product Truth authority |
| `office952/workos-po` | WorkOS PO frontend, seeded from accepted UI20 |
| `office952/workos-ui20` | Historical presentation source at `9446b6d`; not the live product repository |

## Required isolation

- NO GIT SUBMODULE
- NO COPY OF `packages/domain`
- NO COPY OF `apps/api`
- NO SHARED DATABASE FILE
- NO SYMLINK INTO `workos-final`
- NO CLIENT-SPECIFIC BUSINESS FORK
- NO SOURCE IMPORT FROM OLD UI BY DEFAULT

## Local directories

These must remain independent Git repositories:

```text
C:\Users\offic\workspace\workos-final
C:\Users\offic\workspace\workos-po
```

`workos-po` must not live inside `workos-final` or any `workos-final` worktree.

## Remotes

Required remote:

```text
origin = office952/workos-po
```

There must be no writable remote pointing to `office952/workos-final`.

From this project, `workos-final` is read-only reference only.

## What this repository must never become

- a second WorkOS domain
- a renamed clone of `workos-final`
- a fork of WorkOS business logic
- a wholesale copy of the current application
- a parallel calculator or Product Truth owner

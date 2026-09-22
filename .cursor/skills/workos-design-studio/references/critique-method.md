# Critique method

Screenshot-first. The existing UI/UX reviewer stays independent and READ-ONLY.

## PASS A — visual judgment

Before inspecting the implementation diff, inspect the rendered interface.

Ask:

- What does the eye notice first?
- Should it?
- Where is hierarchy weak?
- What is unnecessarily boxed?
- What feels cramped?
- Where is whitespace purposeless?
- Where would greater density improve operation?
- What feels generic?
- What looks mechanically generated?
- What relationship is not spatially obvious?
- What forces unnecessary memory?
- What can be removed?
- What feels unfinished?
- What feels unlike WorkOS?
- Where did the design choose safety instead of clarity?

Also check orientation: where / what / state / next / consequence.

## PASS B — root cause

Only then inspect:

- component structure
- layout
- styles
- DOM
- state / data

Name the cause. Do not restyle a symptom.

Typical causes: wrong `PageWorkspace`, false containers, equalized weight, controls detached from content, Azure used as status, a screenshot treated as authority.

## PASS C — refine

Correct root causes.
Render again.
Compare.

## Default stop rule

```text
design → critique → refine → critique → stop or Owner review
```

Do not create infinite polish loops.

## Owner design vocabulary

| Word | Meaning |
| --- | --- |
| BOLDER | increase the presence of the dominant idea |
| QUIETER | reduce visual competition |
| DISTILL | remove what does not help the job |
| DENSER | use space more efficiently |
| AIRIER | add breathing room where comprehension benefits |
| FOCUS | strengthen the current task/decision |
| CONNECT | express a relationship more clearly |
| SEPARATE | express a real boundary |
| GROUND | make an element feel naturally integrated with its surface |
| POLISH | improve rhythm, proportion, alignment and detail |
| HARDEN | test edge cases/responsive behavior without redesigning |

These words direct judgment. They do not authorize new Product Truth, new routes, token correction, or shell correction.

# Planning Workload V1 canon

Living architecture for Planning / Workload V1 in `office952/workos-po`.

This file is the single Planning contract owner. It is not Product Truth, not Commercial, not a scheduler, and not implementation authorization.

Filename `PLANNING_CAPACITY_V1_CANON.md` is temporary naming debt from the superseded weekly-capacity program. Do not create a second planning canon.

```text
ONE_PLANNING_CANON = YES
PARALLEL_PLANNING_TRUTH = NO
CANON_FILENAME = docs/architecture/PLANNING_CAPACITY_V1_CANON.md
CANON_FILENAME_RENAME = DEFERRED / NAMING_DEBT
LIVING_PROGRAM_AUTHORITY = docs/ROADMAP.md
GLOBAL_CURRENT_PROGRAM_OWNED_HERE = NO
PREVIOUS_CAP0 = SUPERSEDED_IN_PART_BY_OWNER_WORKLOAD_CORRECTION
PLN0 = COMPLETE
PLN1 = COMPLETE / OWNER_ACCEPTED
PLN2 = COMPLETE / OWNER_ACCEPTED
OPERATIONS_CONTROL_V1 = COMPLETE / OWNER_ACCEPTED
PRODUCT_ASSEMBLY_FIRST_CLASS_JOB = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_OPERATIONS_CONTROL_V1 = YES
OPERATIONS_CONTROL_V1_ACCEPTANCE_ADVISORIES = RECORDED / NOT_A_CORRECTION_WAVE
PLN3 = NOT_STARTED
EXECUTION_REALITY_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_EXECUTION_REALITY_V1 = YES
ACTUAL_DURATION_V1 = COMPLETE / OWNER_ACCEPTED
MACHINE_RUN_V1 = COMPLETE / OWNER_ACCEPTED
PLANNED_VS_ACTUAL_TIME_V1 = COMPLETE / OWNER_ACCEPTED
PLANNING_IMPLEMENTATION = OWNER_ACCEPTED
SCHEDULING = NOT_STARTED / OUT_OF_SCOPE_V1
OWNER_ACCEPTED_PLANNING_IMPLEMENTATION = YES
```

Living program sequence is owned by `docs/ROADMAP.md`. Configuration-First architecture remains `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`. PLN1 persistence, API, `/planificare`, and the synthetic Owner reference runtime are Owner-accepted. This document remains the Planning contract owner. PLN2 and Operations Control V1 are Owner-accepted. Acceptance advisories are recorded and are not a correction wave. This document does not authorize PLN3.

Accepted PLN2 contract:

```text
OPERATIONAL_PRIORITY = STANDARD | HIGH | URGENT
DEFAULT_OPERATIONAL_PRIORITY = STANDARD
TARGET_DATE = optional YYYY-MM-DD
PRIORITY_OWNER = JOB PLANNING METADATA
TARGET_DATE_OWNER = JOB PLANNING METADATA
JOB_KIND = PRODUCT | ASSEMBLY
PLANNING_PRODUCT_TRUTH_COUPLING = NONE
PLANNING_COMMERCIAL_COUPLING = NONE
PLANNING_EXECUTION_TRUTH_COUPLING = NONE
DISPLAY_ORDER != EXECUTION_DEPENDENCY
DISPLAY_ORDER != AUTO_DISPATCH
DISPLAY_ORDER != SCHEDULING
OPERATIONAL_DATE_TIMEZONE_SEMANTICS = FOLLOW_UP_REQUIRED_BEFORE_ADVANCED_CALENDAR_AUTOMATION
```

Planner display order is in progress before planned, then urgent before high before standard, then the earliest target date, then a null target date, then the existing PLN1 tie-break. Product jobs still come from OrderSnapshot. Assembly jobs still come from AssemblyOrderSnapshot. Those schemas stay separate. The accepted chain is `/lucrari`, unified Job Detail, `/planificare`, then `/executie`. An accepted assembly is one operational job and keeps the scopes Panou ACM, Litere, and Ansamblare.

Accepted residuals, not a correction wave: the Assembly Job Detail title may show joined inscriptions; overdue uses the UTC calendar day; the planning allocation link uses a separate row; narrow navigation clipping around 390px remains.

## Authority

```text
1. Explicit Owner GO
2. Current office952/workos-po canon and code
3. This document for Planning / Workload V1
4. docs/ROADMAP.md for living program sequence
5. AGENTS.md for compact constitution
```

Owner-confirmed workshop reality outranks the superseded CAP0 weekly-supply decisions.

Repository truth wins over preflight prose. Current domain already uses:

- `CapabilityProvider` with `kind` `WORKCENTER` | `MACHINE`
- Execution assignment of one `assignedProvider` independently of `assignedExecutor`
- Execution task lifecycle `PLANNED` → `IN_PROGRESS` → `COMPLETED`
- in-plan process `seq`, which is not provider queue priority
- People `AVAILABLE` | `TEMPORARILY_UNAVAILABLE` as operational eligibility, not hours
- provider lifecycle `ACTIVE` | `PLANNED` | `RETIRED`
- governance `capacity-planning` as implemented workload planning, with `scheduling` remaining `NOT_IMPLEMENTED` and `machine-run` implemented and Owner-accepted in Execution Reality V1

## Owner-confirmed production reality

```text
V1_DIRECTION = WORKLOAD_FIRST
```

- A machine or workcenter is used when work exists.
- It may run during normal hours or beyond them if the team stays.
- Normal working hours are not a hard machine-capacity ceiling.
- The useful V1 truth is queued / planned effort on a provider.
- WorkOS must not invent 8h/day, 40h/week, or utilization ceilings.
- Working-hours / calendar may later assist forecasting. They must not become a hard execution blocker.

## Current Owner decisions

```text
CAPABILITY_PROVIDER_OWNER = CapabilityProvider
PROVIDER_KINDS = WORKCENTER | MACHINE
AUTOMATIC_PARENT_CHILD_POOLING = NO
AUTOMATIC_PARENT_CHILD_SUM = NO
DOUBLE_COUNTING = FORBIDDEN
PLANNED_EFFORT_OWNER = Execution task planning metadata
PLANNED_EFFORT_PRIMITIVE = plannedEffortMinutes
PLANNED_EFFORT_DEFAULT = UNKNOWN
PLANNED_EFFORT_AUTO_DERIVATION = FORBIDDEN
WORKLOAD_PRIMITIVE = plannedEffortMinutes | UNKNOWN
PLANNING_WINDOW = NONE_IN_V1
TASK_PLANNING_BUCKET = NONE
PROVIDER_CAPACITY_BUCKET = NONE
WEEKLY_AVAILABLE_MINUTES = REMOVE_FROM_V1
PLANNING_WEEK = REMOVE_FROM_V1
HARD_CAPACITY = NO
UTILIZATION_PERCENT = NO
OVERLOAD_VS_WEEKLY_SUPPLY = NO
HARD_EXECUTION_BLOCK = NO
CAPACITY_BLOCKS_PRODUCTION_RELEASE = NO
CAPACITY_BLOCKS_TASK_START = NO
CAPACITY_AUTO_ASSIGN_PROVIDER = NO
CAPACITY_RESERVES_PROVIDER = NO
PEOPLE_CAPACITY = OUT
SCHEDULING = OUT_OF_SCOPE_V1
CAPACITY_COMMERCIAL_COUPLING = NONE
FAKE_BACKFILL = FORBIDDEN
MACHINE_RUN_V1 = COMPLETE / OWNER_ACCEPTED
ACTUAL_DURATION_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_EXECUTION_REALITY_V1 = YES
PRODUCTION_PRIORITY = NOT_IMPLEMENTED_V1_INITIAL
TARGET_DATE = NOT_REQUIRED_FOR_INITIAL_V1
MANUAL_QUEUE_ORDER = DEFERRED
NORMAL_WORKING_HOURS = LATER / OPTIONAL / SOFT_FORECAST_CONTEXT
TEMPORARY_MACHINE_AVAILABILITY = DEFERRED
```

Operator-facing UI may show `plannedEffortMinutes` as **Timp estimat**. The domain field name stays `plannedEffortMinutes`.

## 1. Planning owner

Planning / workload is owned independently by an Execution-assignable `CapabilityProvider`.

Provider kinds already used by Execution:

```text
WORKCENTER
MACHINE
```

Forbidden:

- workcenter workload automatically equals `sum(children)`
- machine workload automatically rolls into the parent workcenter
- parent + child load automatically summed
- requiring a Machine registry before a workcenter can have a queue
- treating a workcenter with no capabilities as an implicit pool for its machines

Reason: Execution already treats `WORKCENTER` and `MACHINE` as independent assignable provider kinds. Manual-only workcenters must remain supported.

```text
CAPABILITY_PROVIDER_OWNER = CapabilityProvider
AUTOMATIC_PARENT_CHILD_POOLING = NO
AUTOMATIC_PARENT_CHILD_SUM = NO
DOUBLE_COUNTING = FORBIDDEN
```

A workcenter that lists no capabilities is a location / grouping, not a workload owner, unless it is itself assignable for a capability.

## 2. Planned effort

V1 workload primitive:

```text
plannedEffortMinutes
```

It is:

- explicit planning input
- attached to an Execution task
- entered by a planner
- optional / UNKNOWN until provided
- internal operational planning truth

It is not derived automatically from:

- m2
- ml
- buc
- resource quantity
- commercial price
- internal cost rate
- installation `plannedDurationHours`
- `startedAt` / `completedAt`
- machine catalog capability
- labor or service recipes
- Product Truth technical quantities

```text
NO_VALUE = UNKNOWN
NO_VALUE != 0
```

Do not treat process-default minutes as V1 authority. Do not treat automatic duration formulas as V1 authority. Those may be future enhancements only, under a later Owner GO.

`plannedEffortMinutes` is not Product Truth, Commercial Price, Estimated Internal Cost, resource quantity, MachineRun actual, HR / Pontaj, or site-installation crew hours. Execution Reality V1 may record `actualDurationMinutes` and MachineRun duration on the task. Planning does not read those facts and does not rewrite `plannedEffortMinutes` from them.

PLN0 does not define persistence schema or migration fields.

## 3. Workload-first contract

This is workload, not a capacity ceiling, utilization, scheduling, or ETA.

```text
WORKLOAD_PRIMITIVE = plannedEffortMinutes | UNKNOWN
```

For one exact `CapabilityProvider`:

```text
PROVIDER_KNOWN_QUEUED_EFFORT =
  sum(plannedEffortMinutes)
  for relevant open tasks assigned to that exact provider
  where effort is known

UNKNOWN_EFFORT_COUNT =
  open assigned tasks with UNKNOWN effort

UNASSIGNED_OPEN_TASKS =
  open tasks requiring a provider but without assignedProvider
```

V1 has no weekly bucket. Do not force a task into `YYYY-Www`. Do not compute remaining minutes against invented supply.

Missing facts must never render as `0`, `100%`, or a green complete state.

## 4. Task state model

```text
PLANNED =
  included in provider workload when assigned
IN_PROGRESS =
  included in provider workload
COMPLETED =
  not in current queued workload
```

```text
plannedEffortMinutes =
  editable while PLANNED
  frozen when the task starts / becomes IN_PROGRESS
```

UNKNOWN never becomes 0 automatically.

Provider assignment remains explicit. Workload must not auto-assign a provider.

## 5. Queue model

V1 requires a provider workload / queue **read** model.

The initial PLN1 slice did not introduce manual priority, sort-order, or target-date fields.

Display order may use deterministic existing facts. Current Execution `seq` is in-plan process order. It must not be redefined as provider priority.

```text
PRODUCTION_PRIORITY = NOT_IMPLEMENTED_V1_INITIAL
TARGET_DATE = NOT_REQUIRED_FOR_INITIAL_V1
MANUAL_QUEUE_ORDER = DEFERRED
```

PLN2, Owner-accepted, adds job-level operational priority and an optional target date. They order the planner and can mark an overdue target. They do not schedule, dispatch, or change Execution dependencies.

## 6. No hard capacity

Workload must not block:

- production release
- provider assignment
- task start
- task completion

No Execution lifecycle mutation is introduced by Planning V1.

There is no weekly overload warning, because there is no weekly supply.

```text
HARD_EXECUTION_BLOCK = NO
HARD_CAPACITY = NO
UTILIZATION_PERCENT = NO
OVERLOAD_VS_WEEKLY_SUPPLY = NO
CAPACITY_AUTO_ASSIGN_PROVIDER = NO
CAPACITY_RESERVES_PROVIDER = NO
```

EXE2 assignment remains explicit.

Planning fields are optional. Execution already works when effort is UNKNOWN. V1 does not require an organization DISABLED / ENABLED Capacity mode.

```text
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
NO_CLIENT_CODE_FORK = YES
```

## 7. People capacity

```text
PEOPLE_CAPACITY = OUT
```

Existing People availability remains eligibility / operational availability. It is not capacity hours, shift, attendance, or an employee calendar.

Do not infer workforce capacity. Do not create an HR / Pontaj dependency for Planning V1.

## 8. Workload versus scheduling

Workload V1 answers:

- which open tasks are assigned to this provider?
- how much known planned effort is queued there?
- how many assigned tasks have UNKNOWN effort?
- which open tasks still need a provider?

Workload V1 does not answer:

- exact day / time
- optimized sequence
- remaining weekly minutes
- utilization percent
- ETA
- dispatch priority
- due-date optimization

```text
SCHEDULING = OUT_OF_SCOPE_V1
```

Out of V1:

- day planning
- hour slot
- shift
- holiday calendar
- maintenance calendar
- `scheduledStart` / `scheduledEnd`
- Gantt
- drag / drop scheduling
- optimizer
- ETA engine
- shift engine

## 9. Conceptual planner surface

Canon only. No UI in PLN0.

Primary future planning surface is a planner view grouped by provider. It is not Atelier, not the only job-centric Execution page, and not admin registry CRUD.

Atelier remains operator-centric.
Execution remains per-job operational control.

The planner surface should support:

- provider grouping
- open assigned tasks
- known queued effort
- unknown effort count
- unassigned pool

Example:

```text
CNC Router
  1. PURE CLIMATE letters — 45m
  2. Finestore ACM — 2h15m
  3. Virandy letters — 1h30m
Known workload: 4h30m
Unknown effort: 2 tasks
```

## 10. Existing and historical plans

Plans created before Planning Workload V1 receive no backfill.

```text
plannedEffortMinutes = UNKNOWN unless explicitly added later under an authorized policy
FAKE_BACKFILL = FORBIDDEN
```

No historical execution rewrite. No deriving effort from timestamps.

Later planning configuration must not rewrite completed or frozen business history.

## 11. Commercial boundary

```text
CAPACITY_COMMERCIAL_COUPLING = NONE
```

Never derive client price from:

- `plannedEffortMinutes`
- provider queued effort
- unknown-effort counts
- later working-hours forecast

Planning does not modify accepted quote / order commercial truth.
Site-installation `plannedDurationHours` remains commercial / installation labor, not atelier workload.

## 12. MachineRun and actual duration

```text
MACHINE_RUN_V1 = COMPLETE / OWNER_ACCEPTED
ACTUAL_DURATION_V1 = COMPLETE / OWNER_ACCEPTED
OWNER_ACCEPTED_EXECUTION_REALITY_V1 = YES
```

Execution Reality records these facts. Planning does not consume them. `startedAt` / `completedAt` are Execution lifecycle timestamps. They are not automatically machine runtime, productive minutes, or operator labor time.

Do not add telemetry, IoT, or runtime counters for Planning V1.

## 13. Machine availability

Keep separate:

- provider lifecycle
- queued workload
- temporary machine availability
- future working-hours forecast

Current lifecycle:

```text
ACTIVE
PLANNED
RETIRED
```

```text
TEMPORARY_MACHINE_AVAILABILITY = DEFERRED
```

Do not invent a maintenance / down state in PLN0. Workload remains readable independently of any later machine-down state.

## 14. Working hours

Normal working hours are later, optional, soft forecast context.

They are not hard Capacity, provider eligibility, a task-start blocker, or a production-release blocker.

Future example only:

```text
Approx. 12h planned work exceeds today's normal working window.
```

Overtime remains possible.

No:

- 8h/day default
- 40h/week default
- Romanian holiday assumption
- People-hours inference
- shift engine

```text
NORMAL_WORKING_HOURS = LATER / OPTIONAL / SOFT_FORECAST_CONTEXT
```

## 15. Smart modularity

```text
COMMERCIAL_ONLY
  No planning fields required. Commercial path unaffected.

MANUAL_ONLY
  A WORKCENTER provider can own a queue. A Machine is not required.

SMALL_COMPANY
  Few providers, manually entered task minutes, derived display order.

ADVANCED_COMPANY
  Multiple independently assignable machines and workcenters.
  No parent-child double counting.

NO_PLANNING_ADOPTION
  Execution still works. Effort remains UNKNOWN.

ENABLE_LATER
  Old records stay intact. No fake workload history.

OVERTIME
  No arbitrary hard capacity block.

MACHINE_DOWN
  Later availability. Current queued workload remains readable.

NO_CLIENT_CODE_FORK = YES
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
```

## 16. Program sequence

```text
PLN0 = canon correction / workload-first contract
PLN1 = plannedEffortMinutes
       + provider workload projection
       + planner queue / read surface
       + derived deterministic display order
PLN2 = job priority STANDARD|HIGH|URGENT and optional target date
       COMPLETE / OWNER_ACCEPTED
       display order only; not scheduling
PLN3 = optional soft working-hours forecast / NOT_STARTED
```

Do not over-fragment PLN1. Effort without a provider total is not useful. A provider total cannot exist without the effort field.

Scheduling remains outside V1.

PLN1 implementation is Owner-accepted. PLN2 is Owner-accepted. This document does not authorize PLN3.

Do not revive MaterializedOpsGraph, DEC-009, scoped-B, old capacity fixtures, hardcoded workcenter names, or FastAPI / V2 architecture.

## 17. Superseded CAP0 weekly-capacity model

The previous CAP0 weekly-capacity contract is **superseded in part**.

It remains valid for: CapabilityProvider owner, WORKCENTER | MACHINE, explicit `plannedEffortMinutes`, UNKNOWN != 0, no People Capacity, no Scheduling V1, no parent-child sum, no commercial coupling, no fake backfill, no MachineRun-as-capacity, no hard execution block.

It is no longer V1 authority for:

```text
PLANNING_WINDOW = ISO_CALENDAR_WEEK
TASK_PLANNING_BUCKET = planningWeek
PROVIDER_CAPACITY_BUCKET = CapabilityProvider + planningWeek
availableMinutes
weekly provider supply
SUPPLY - LOAD remaining
utilization percent
weekly overload
DISABLED | ENABLED weekly Capacity mode as a V1 gate
CAP2 weekly supply as the next wave
```

Do not implement weekly provider `availableMinutes`. Cancelled CAP2 weekly-supply drafts are not product.

```text
PREVIOUS_CAP0 = SUPERSEDED_IN_PART_BY_OWNER_WORKLOAD_CORRECTION
CAP2_WEEKLY_SUPPLY = CANCELLED
```

## 18. PLN1 implementation questions

These questions were open before PLN1. They do not reopen the workload-first direction. The accepted implementation answers them in the domain, API, and `/planificare`.

- exact persistence representation for `plannedEffortMinutes`
- whether planner write maps to Owner or another existing permission
- exact new-plan versus existing-plan edit behavior
- exact derived display-order tie-break among existing facts

```text
PLN1 = COMPLETE / OWNER_ACCEPTED
PLN2_IMPLEMENTATION = COMPLETE / OWNER_ACCEPTED
PLN3_IMPLEMENTATION = NOT_AUTHORIZED_BY_THIS_DOCUMENT
PLANNING_CALCULATION = IMPLEMENTED / OWNER_ACCEPTED
```

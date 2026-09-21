# Planning Capacity V1 canon

Living architecture for Planning / Capacity V1 in `office952/workos-po`.

This file is the single Capacity contract owner. It is not Product Truth, not Commercial, not a scheduler, and not implementation authorization.

```text
ONE_CAPACITY_CANON = YES
PARALLEL_CAPACITY_TRUTH = NO
CAPACITY_IMPLEMENTATION = NOT_STARTED
CAP0 = IMPLEMENTED_IN_REVIEW
CAP1 = NOT_STARTED
CAP2 = NOT_STARTED
CAP3 = NOT_STARTED
SCHEDULING = NOT_STARTED / OUT_OF_SCOPE_V1
PLANNING_CAPACITY_V1_PREFLIGHT = COMPLETE
PLANNING_CAPACITY_V1_OWNER_DECISIONS = LOCKED
OWNER_ACCEPTED_CAPACITY_IMPLEMENTATION = NO
```

Living program sequence is owned by `docs/ROADMAP.md`. Configuration-First architecture remains `docs/architecture/WORKOS_CONFIGURATION_FIRST_CANON.md`. This document does not authorize CAP1, persistence, API, UI, or migration.

## Authority

```text
1. Explicit Owner GO
2. Current office952/workos-po canon and code
3. This document for Planning / Capacity V1
4. docs/ROADMAP.md for living program sequence
5. AGENTS.md for compact constitution
```

Repository truth wins over preflight prose. Current domain already uses:

- `CapabilityProvider` with `kind` `WORKCENTER` | `MACHINE`
- Execution assignment of one `assignedProvider` independently of `assignedExecutor`
- People `AVAILABLE` | `TEMPORARILY_UNAVAILABLE` as operational eligibility, not hours
- governance `capacity-planning`, `scheduling`, and `machine-run` as `NOT_IMPLEMENTED`

## Locked Owner decisions

```text
OWNER_DECISIONS_1_TO_4 = LOCKED
CAPACITY_PROVIDER_OWNER = CapabilityProvider
PROVIDER_KINDS = WORKCENTER | MACHINE
AUTOMATIC_PARENT_CHILD_POOLING = NO
AUTOMATIC_PARENT_CHILD_SUM = NO
DOUBLE_COUNTING = FORBIDDEN
PLANNED_EFFORT_OWNER = Execution task planning metadata
PLANNED_EFFORT_PRIMITIVE = plannedEffortMinutes
PLANNED_EFFORT_DEFAULT = UNKNOWN
PLANNED_EFFORT_AUTO_DERIVATION = FORBIDDEN
PLANNING_WINDOW = ISO_CALENDAR_WEEK
TASK_PLANNING_BUCKET = planningWeek
PROVIDER_CAPACITY_BUCKET = CapabilityProvider + planningWeek
CAPACITY_AVAILABLE_MODES = DISABLED | ENABLED
CAPACITY_DEFAULT_MODE = DISABLED
OVERLOAD_POLICY = WARNING_ONLY
CAPACITY_BLOCKS_PRODUCTION_RELEASE = NO
CAPACITY_BLOCKS_TASK_START = NO
CAPACITY_AUTO_ASSIGN_PROVIDER = NO
CAPACITY_RESERVES_PROVIDER = NO
PEOPLE_CAPACITY = OUT
CAPACITY_COMMERCIAL_COUPLING = NONE
FAKE_BACKFILL = FORBIDDEN
MACHINE_RUN = NOT_IMPLEMENTED
ACTUAL_DURATION_V1 = NOT_IMPLEMENTED
```

## 1. Capacity provider

Capacity is owned independently by an Execution-assignable `CapabilityProvider`.

Provider kinds already used by Execution:

```text
WORKCENTER
MACHINE
```

Each assignable provider may carry its own Capacity configuration.

Forbidden:

- workcenter capacity automatically equals `sum(children)`
- machine capacity automatically rolls into the parent workcenter
- parent + child load automatically summed
- requiring a Machine registry for Capacity
- treating a workcenter with no capabilities as an implicit capacity pool for its machines

Reason: Execution already treats `WORKCENTER` and `MACHINE` as independent assignable provider kinds. Manual-only workcenters must remain supported.

```text
CAPACITY_PROVIDER_OWNER = CapabilityProvider
AUTOMATIC_PARENT_CHILD_POOLING = NO
AUTOMATIC_PARENT_CHILD_SUM = NO
DOUBLE_COUNTING = FORBIDDEN
```

A workcenter that lists no capabilities is a location / grouping, not a Capacity owner, unless it is itself assignable for a capability.

## 2. Planned effort

Capacity V1 demand primitive:

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

### Ownership boundary

`plannedEffortMinutes` is not:

- Product Truth
- Commercial Price
- Estimated Internal Cost
- resource quantity
- MachineRun actual
- HR / Pontaj
- site-installation crew hours

It is operational planning metadata for the Execution task.

CAP0 does not define persistence schema or migration fields.

```text
PLANNED_EFFORT_MUTABILITY = TO_BE_DEFINED_IN_CAP1_IMPLEMENTATION_PREFLIGHT
PLANNING_WEEK_MUTABILITY = TO_BE_DEFINED_IN_CAP1_IMPLEMENTATION_PREFLIGHT
```

Do not silently invent whether values freeze at production release, provider assignment, task start, or another point. CAP1 must resolve mutability from current Execution lifecycle evidence before any persistence write.

## 3. Capacity window

Capacity V1 time bucket is an ISO calendar week.

Canonical representation concept:

```text
YYYY-Www
```

Example: `2026-W39`.

Each capacity-planned task may have `planningWeek`.
Each capacity-enabled assignable provider may have explicit available capacity for a given `planningWeek`.

Aggregation key:

```text
provider identity + planningWeek
```

No finer scheduling granularity in V1.

Explicitly out of V1:

- day planning
- hour slot
- shift
- holiday calendar
- maintenance calendar
- `scheduledStart` / `scheduledEnd`
- Gantt
- drag / drop scheduling
- optimizer
- ETA
- dispatch priority
- due-date policy

`planningWeek` is a bucket, not a scheduler.

## 4. Provider weekly capacity

Capacity supply primitive concept:

```text
availableMinutes
```

or a semantically equivalent later field, per:

```text
CapabilityProvider + planningWeek
```

Operator-facing copy may talk in hours. Domain precision may use minutes later. CAP0 does not authorize the storage representation.

Missing provider-week capacity:

```text
UNKNOWN
```

not `0`, not `100%`, not `unavailable`.

Forbidden defaults:

- recurring Monday-Friday
- 40 hours / week
- 8 hours / day
- Romanian-holiday calendars

## 5. Enablement

Capacity is an optional organization capability.

```text
AVAILABLE_MODES = DISABLED | ENABLED
DEFAULT = DISABLED
```

Owner explicitly enables Capacity for the organization.

When `DISABLED`:

- commercial workflow works
- quote works
- acceptance / order works
- production release works
- Execution works
- provider assignment works
- operator execution works

No Capacity calculation is required. No customer needs Cursor or CLI to use disabled mode.

```text
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
NO_CLIENT_CODE_FORK = YES
```

## 6. Overload policy

```text
OVERLOAD = WARNING_ONLY
```

Capacity does not block:

- production release
- provider assignment
- task start
- task completion

No Execution lifecycle mutation is introduced by Capacity V1.

```text
CAPACITY_BLOCKS_PRODUCTION_RELEASE = NO
CAPACITY_BLOCKS_TASK_START = NO
CAPACITY_AUTO_ASSIGN_PROVIDER = NO
CAPACITY_RESERVES_PROVIDER = NO
```

EXE2 assignment remains explicit. Capacity must not pick an eligible provider automatically.

## 7. People capacity

```text
PEOPLE_CAPACITY = OUT
```

Existing People availability remains eligibility / operational availability. It is not capacity hours, shift, attendance, or an employee calendar.

Do not infer workforce capacity. Do not create an HR / Pontaj dependency for Capacity V1.

## 8. Capacity versus scheduling

Capacity V1 answers:

- what planned load is assigned to this provider in this week?
- how much provider capacity is explicitly configured?
- how much remains?
- is the provider overloaded?
- what facts are UNKNOWN?

Capacity V1 does not answer:

- exact day / time
- exact sequence inside the week
- optimized schedule
- ETA
- dispatch priority
- due-date optimization

Scheduling remains out of scope for V1.

## 9. Conceptual projection

For one provider + `planningWeek`, the intended later read model is:

```text
KNOWN_LOAD = sum(plannedEffortMinutes)
```

only for tasks that:

- belong to that `planningWeek`
- are assigned to that exact provider
- have known `plannedEffortMinutes`
- are relevant to current planning state per a future CAP3 contract

```text
SUPPLY = explicit provider capacity for that same planningWeek
remaining = supply - knownLoad
overload = knownLoad > supply
```

CAP0 does not decide CAP3 relevance rules, persistence, or API shape.

Tasks with unknown effort are incomplete / UNKNOWN facts. They are not counted as zero.
Tasks without `planningWeek` are unplanned / UNKNOWN. They are not silently inserted into the current week.

Missing facts must never render as `0`, `100%`, or a green complete state.

## 10. Existing and historical plans

Plans created before Capacity V1 receive no backfill.

```text
plannedEffortMinutes = UNKNOWN unless explicitly added later under an authorized policy
planningWeek = UNKNOWN unless explicitly planned later under an authorized policy
FAKE_BACKFILL = FORBIDDEN
```

No historical execution rewrite. No deriving effort from timestamps.

Later Capacity configuration changes must not rewrite completed or frozen business history. Exact freeze points remain a CAP1 preflight question.

## 11. Commercial boundary

```text
CAPACITY_COMMERCIAL_COUPLING = NONE
```

Never derive client price from:

- `plannedEffortMinutes`
- `planningWeek`
- provider available minutes
- load percent
- remaining capacity
- overload

Capacity does not modify accepted quote / order commercial truth.
Site-installation `plannedDurationHours` remains commercial / installation labor, not atelier Capacity.

## 12. MachineRun and actual duration

```text
MACHINE_RUN = NOT_IMPLEMENTED
ACTUAL_DURATION_V1 = NOT_IMPLEMENTED
```

`startedAt` / `completedAt` are Execution lifecycle timestamps. They are not automatically machine runtime, productive minutes, or operator labor time.

Do not add telemetry, IoT, or runtime counters for Capacity V1.

## 13. Smart modularity

```text
COMMERCIAL_ONLY
  Capacity DISABLED. Commercial path unaffected.

MANUAL_ONLY
  A WORKCENTER provider can own weekly capacity. A Machine is not required.

SMALL_COMPANY
  Few providers, manually planned task minutes, weekly warnings.

ADVANCED_COMPANY
  Multiple independently assignable machines and workcenters.
  No parent-child double counting.

ENABLE_LATER
  Old records stay intact. No fake capacity history.

CONFIG_CHANGE_LATER
  Historical execution truth is not rewritten.

NO_CLIENT_CODE_FORK = YES
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
```

## 14. Future waves

Recorded order. Not authorized by this document.

```text
CAP0 = canon + locked Owner decisions + living-doc sync
CAP1 = task planning truth
  expected subject: plannedEffortMinutes, planningWeek,
  lifecycle / mutability, historical safety, planner persistence / API / UI
CAP2 = provider weekly-capacity configuration
  expected subject: enablement, provider + week capacity,
  Owner configuration, version / history semantics
CAP3 = capacity load projection + operational UI
  expected subject: known load, unknown facts, remaining, overload warning
```

CAP1 / CAP2 order may be adjusted after an implementation preflight only if current repository evidence requires it. No CAP1 implementation is authorized here.

Do not revive MaterializedOpsGraph, DEC-009, scoped-B, old capacity fixtures, hardcoded workcenter names, or FastAPI / V2 architecture.

## 15. Open questions for CAP1

These remain implementation questions. They do not reopen Owner decisions 1-4.

- exact persistence representation
- exact `plannedEffortMinutes` mutability / freeze point
- exact `planningWeek` mutability / freeze point
- whether planner write maps to Owner or another existing permission
- exact new-plan versus existing-plan edit behavior
- CAP3 rule for which task states count toward `KNOWN_LOAD`

```text
CAP1_IMPLEMENTATION = NOT_AUTHORIZED_BY_THIS_DOCUMENT
CAP2_IMPLEMENTATION = NOT_AUTHORIZED_BY_THIS_DOCUMENT
CAP3_IMPLEMENTATION = NOT_AUTHORIZED_BY_THIS_DOCUMENT
CAPACITY_CALCULATION = NOT_IMPLEMENTED
```

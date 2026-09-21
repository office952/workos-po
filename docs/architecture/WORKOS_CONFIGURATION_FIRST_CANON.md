# WorkOS Configuration-First canon

Living architecture for changeable business truth in `office952/workos-po`.

This file is the single Configuration-First architecture owner. It is not a second Product Truth, not a second roadmap, and not an implementation authorization.

```text
STATUS = CF1_AND_CF2_CF3_COMPLETE
CONFIGURATION_FIRST_DIRECTION = CANONICAL
NO_SILENT_BUSINESS_TRUTH = CANONICAL
FUNCTIONAL_WORKOS_FIRST = YES
OPTIONAL_BUSINESS_AUTOMATION_MUST_NOT_CREATE_DEAD_END = YES
SAFE_MANUAL_FALLBACK = REQUIRED_WHERE_SEMANTICALLY_VALID
IMPLEMENTATION_AUTHORIZED = CF1_COMPLETE_AND_CF2_CF3_COMPLETE
DB_IMPLEMENTATION_AUTHORIZED = COMMERCIAL_POLICY_VERSIONS_AND_TECHNICAL_SETTING_VERSIONS
CF1_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF1_INTEGRATED_ON_MAIN = YES
CF1_MERGE = COMPLETE
MERGE_COMMIT = ec899ba294f37e614617256260727bd9eb61d6e3
PR_8 = MERGED
CF2_CF3_TECHNICAL_CONFIGURATION_V1 = COMPLETE
CF2 = COMPLETE
CF3 = COMPLETE
CF2_CF3_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_INTEGRATED_ON_MAIN = YES
CF2_CF3_MERGE = COMPLETE
CF2_CF3_MERGE_COMMIT = 8e573617d0db8378961cce3dc6b3cbb74691511a
PR_10 = MERGED
CF4 = NOT_STARTED
CF5 = NOT_STARTED
NEXT_WAVE_AUTHORIZED = NO
FORMULA_CONFIGURABILITY_FULLY_DELIVERED = NO
```

Authority:

```text
1. Explicit Owner GO
2. Current office952/workos-po canon and code
3. This document for Configuration-First architecture
4. docs/ROADMAP.md for living program sequence
5. AGENTS.md for compact constitution
```

Related living documents:

- `docs/ROADMAP.md` — living program authority
- `docs/SOURCE_OF_TRUTH.md` — repository / data / Product Truth authorities
- `docs/ARCHITECTURE.md` — product/runtime architecture
- `docs/PRODUCTION_RUNTIME.md` — Cloud topology and tenancy
- `AGENTS.md` — compact agent constitution

```text
PRODUCT_MODEL = SAAS_ONLY
ONE_PRODUCT_REPOSITORY = office952/workos-po
ONE_BUSINESS_ENGINE = YES
ONE_PRODUCT_TRUTH = YES
NO_CLIENT_CODE_FORK = YES
HUB_MEDIA = VALIDATION_ORGANIZATION_NOT_UNIVERSAL_PRODUCT_LAW
PRIMARY_USER_JOURNEY = COMPLETE
PRIMARY_USER_JOURNEY_PROOF = SYNTHETIC_SAAS_E2E
NEXT_PROGRAM = WORKOS_CONFIGURATION_FIRST_FOUNDATION_V1
```

## 1. Direction

```text
WORKOS = CONFIGURATION-FIRST BUSINESS ENGINE
```

Core invariant:

```text
IF A BUSINESS VALUE MAY LEGITIMATELY CHANGE
WITHOUT CHANGING SOFTWARE BEHAVIOR,
IT MUST NOT REQUIRE A SOURCE-CODE EDIT.
```

Where practical, these are configuration, not source constants:

- business formulas
- prices
- rates
- technical settings
- production parameters
- thresholds
- tolerances
- defaults
- product variants
- option lists
- commercial rules
- resource / default selections

```text
HARDCODED_CHANGEABLE_BUSINESS_VALUES = NO
HARDCODED_CHANGEABLE_PRICE_FORMULAS = NO
HARDCODED_CHANGEABLE_WORKSHOP_PARAMETERS = NO
```

When a business-relevant fact cannot yet be made safely configurable:

```text
FIXED_VISIBLE_INFORMATION = REQUIRED
SILENT_BURIED_BUSINESS_TRUTH = FORBIDDEN
```

HUB MEDIA is a validation organization. It is not universal product law and must not be copied into platform constants.

## 2. What this is not

This canon rejects:

- a second Product Truth or second pricing / formula / execution engine
- a client-specific code fork
- an unbounded no-code ERP builder
- a universal untyped Settings JSON blob
- one mega Settings table as owner of all business truth
- a universal scope precedence such as `VARIANT > FAMILY > ORGANIZATION`
- live platform inheritance that silently mutates existing organizations
- historical rewrite of accepted quotes, jobs, or production records
- customer dependence on Cursor, source access, terminal, or direct database editing
- treating a hardcoded number swap as Configuration-First

CF0 documented architecture only. CF1_COMMERCIAL_VERTICAL_V1 is the first authorized functional slice: organization commercial defaults, quote-specific commercial terms, a narrow resolver, commercial admin, engine consumption, snapshot provenance, and a supported manual product price. It does not authorize technical-settings persistence, a formula engine, customer commercial defaults, or real Cloud/DB access.

```text
ORGANIZATION_COMMERCIAL_POLICY = DEFAULTS
QUOTE_COMMERCIAL_TERMS = JOB_INPUT
NEGOTIATED_QUOTE_OVERRIDE = SUPPORTED
MANUAL_FIXED_PRODUCT = SUPPORTED
CUSTOMER_COMMERCIAL_DEFAULT = FUTURE_OPTIONAL_LAYER
ADMIN_CONFIGURATION_NAVIGATION = one L1 Administration entry + domain-owned L2
ORGANIZATION_COMMERCIAL_DEFAULT → QUOTE DRAFT TERMS → FROZEN QUOTE
NEGOTIATION_AFTER_FREEZE → NEW QUOTE REVISION
FROZEN_QUOTE_MUTATION = NO
ACCEPTANCE_TARGETS_EXACT_SNAPSHOT = YES
```

## 3. Ownership: code, configuration, job input

### Code / domain owns

- engine contracts and types
- validation
- safe formula evaluation
- dependency resolution
- scope / override validation
- version semantics
- audit semantics
- snapshot semantics
- tenancy / security
- integrity
- safe state-machine invariants
- system invariants

The engine remains the only evaluator of Product Truth, Quote, Order, Production Release, EIC, and execution. Configuration does not move that authority into the UI.

### Configuration / business data owns, where applicable

- values
- formulas
- thresholds
- tolerances
- prices
- rates
- defaults
- variants
- option lists
- applicability conditions
- workshop parameters
- commercial rules
- resource / default selections

### Job input owns

- order / job-specific measurements
- quantities
- width / height
- L1 / L2
- uploaded geometry references
- quote-specific markup, discount, and commercial adjustment
- other case-specific operator inputs

Job inputs are not organization settings and not configuration overrides.

```text
TECHNICAL_QUANTITY != RESOURCE_IDENTITY != COST_EVIDENCE != COMMERCIAL_PRICE
JOB_INPUT != ORGANIZATION_SETTING
```

Do not move prices into generic technical settings. Do not move technical geometry into pricing.

## 4. Shared configuration semantics

Every persisted configurable definition shares these semantics. Shared semantics are not a license for one untyped store.

```text
identity
type
unit
scope
version
activation status
effective period
source / provenance
audit
snapshot reference
resolution contract
ownerDomain
allowedScopes
overridePolicy
```

Domain ownership stays separate:

| Domain | Owns |
| --- | --- |
| Product / Production | technical settings, variants, product-family configuration, geometry policy, product-bound formula relationships |
| Resources / Cost | resource identity, cost evidence, resource rates |
| Commercial | organization commercial defaults, quote-specific commercial terms, VAT, commercial price rules |
| Formula / Calculation | formula definition contract and safe evaluation |
| Organization | organization-level defaults and capabilities that the definition explicitly allows |
| Platform Owner | platform contracts and starter defaults, never silent mutation of private organization configuration |

```text
SHARED_RESOLUTION_SEMANTICS = REQUIRED
GENERIC_MEGA_SETTINGS_BLOB = REJECTED
DOMAIN_OWNED_CONFIGURATION = REQUIRED
```

Future persistence may be additive and typed per domain. Any schema or migration requires a later explicit Owner DB GO.

## 5. Configuration classes

Every configurable definition must declare `ownerDomain`, `allowedScopes`, and `overridePolicy`. The resolver may apply only overrides the definition explicitly allows.

### Shared field meanings

| Field | Meaning |
| --- | --- |
| `OWNER_DOMAIN` | Capability that may create and validate the definition |
| `ALLOWED_SCOPE` | Scopes the definition may bind to. Not a global ladder. |
| `EDITABILITY` | Who may change it, and whether it is data or code |
| `ALLOWED_OVERRIDES` | Narrower scopes that may replace this value |
| `OVERRIDE_POLICY` | How an allowed override is chosen. No implicit fallback. |
| `TYPE_SAFETY` | Required value type |
| `UNIT_SAFETY` | Required unit, or unitless |
| `VALIDATION` | Fail-closed checks before activation |
| `VERSIONING` | New version on material change |
| `ACTIVATION_STATUS` | Draft / needs confirmation / active / retired |
| `AUDIT` | Who changed what, when, from which version |
| `VISIBILITY` | Operator / admin / documentation visibility |
| `SNAPSHOT_BEHAVIOR` | What is frozen when quote / job / production truth is confirmed |
| `PERMISSION_MODEL` | Basic admin vs advanced capability vs platform |
| `MISSING_VALUE_BEHAVIOR` | Fail closed, explicit default, or not applicable |

### SYSTEM_INVARIANT

Software behavior that is not a business setting.

```text
OWNER_DOMAIN = CODE / DOMAIN
ALLOWED_SCOPE = PLATFORM_CONTRACT
EDITABILITY = SOURCE_CHANGE_ONLY
ALLOWED_OVERRIDES = NONE
OVERRIDE_POLICY = NONE
TYPE_SAFETY = CONTRACT
UNIT_SAFETY = CONTRACT
VALIDATION = COMPILE_AND_ENGINE
VERSIONING = ENGINE_CONTRACT
ACTIVATION_STATUS = ALWAYS_IN_FORCE
AUDIT = SOURCE_HISTORY
VISIBILITY = DOCUMENTATION
SNAPSHOT_BEHAVIOR = CONTRACT_IDENTITY_ONLY
PERMISSION_MODEL = PLATFORM_ENGINEERING
MISSING_VALUE_BEHAVIOR = ENGINE_FAIL_CLOSED
```

Examples: tenancy isolation, quote freeze immutability, `TECHNICAL_QUANTITY != COMMERCIAL_PRICE`, no client code fork.

### ORGANIZATION_SETTING

Organization-owned defaults that a definition explicitly allows at organization scope.

```text
OWNER_DOMAIN = ORGANIZATION or the declaring domain
ALLOWED_SCOPE = ORGANIZATION
EDITABILITY = ORGANIZATION_ADMIN for basic; ADVANCED_PERMISSION if the definition requires it
ALLOWED_OVERRIDES = ONLY_IF_DEFINITION_ALLOWS
OVERRIDE_POLICY = EXPLICIT_PER_DEFINITION
TYPE_SAFETY = TYPED
UNIT_SAFETY = DECLARED
VALIDATION = FAIL_CLOSED
VERSIONING = REQUIRED
ACTIVATION_STATUS = REQUIRED
AUDIT = REQUIRED
VISIBILITY = ORGANIZATION_ADMINISTRATION
SNAPSHOT_BEHAVIOR = RESOLVE_THEN_FREEZE
PERMISSION_MODEL = BASIC or ADVANCED per definition
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED unless the definition allows a noncritical default
```

Example: organization VAT / commercial policy, when the commercial definition is organization-owned.

### PRODUCT_FAMILY_CONFIGURATION

Family-level product or production configuration.

```text
OWNER_DOMAIN = PRODUCT / PRODUCTION
ALLOWED_SCOPE = PRODUCT_FAMILY
EDITABILITY = ADVANCED_PRODUCT_CONFIGURATION
ALLOWED_OVERRIDES = VARIANT only if the family definition allows it
OVERRIDE_POLICY = EXPLICIT_PER_DEFINITION
TYPE_SAFETY = TYPED
UNIT_SAFETY = DECLARED
VALIDATION = FAIL_CLOSED
VERSIONING = REQUIRED
ACTIVATION_STATUS = REQUIRED
AUDIT = REQUIRED
VISIBILITY = PRODUCT_ADMINISTRATION
SNAPSHOT_BEHAVIOR = RESOLVE_THEN_FREEZE
PERMISSION_MODEL = ADVANCED
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED for required family settings
```

Example: geometry policy that is family-owned rather than organization-owned.

### PRODUCT_VARIANT_CONFIGURATION

Finite, typed differences between product variants. Variants are data when they change business configuration, not software behavior.

```text
OWNER_DOMAIN = PRODUCT SYSTEM
ALLOWED_SCOPE = PRODUCT_VARIANT
EDITABILITY = ADVANCED_PRODUCT_CONFIGURATION
ALLOWED_OVERRIDES = NONE unless the variant definition allows a narrower job input
OVERRIDE_POLICY = EXPLICIT_PER_DEFINITION
TYPE_SAFETY = TYPED
UNIT_SAFETY = DECLARED
VALIDATION = FAIL_CLOSED
VERSIONING = REQUIRED
ACTIVATION_STATUS = REQUIRED
AUDIT = REQUIRED
VISIBILITY = PRODUCT_ADMINISTRATION
SNAPSHOT_BEHAVIOR = RESOLVE_THEN_FREEZE
PERMISSION_MODEL = ADVANCED
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED for required variant settings
```

V1 primitives may include: number, boolean, enum / option, typed reference, threshold, price / rate / minimum, simple condition, safe formula, variant, effective version.

Do not encode every future product as a generic graph editor.

### RESOURCE_DEFINITION

Identity and specification of a material, service, or labor resource.

```text
OWNER_DOMAIN = RESOURCES
ALLOWED_SCOPE = ORGANIZATION_RESOURCE_CATALOG
EDITABILITY = ADVANCED_RESOURCE_CONFIGURATION
ALLOWED_OVERRIDES = NONE for identity
OVERRIDE_POLICY = NONE
TYPE_SAFETY = TYPED
UNIT_SAFETY = RESOURCE_UNIT
VALIDATION = FAIL_CLOSED
VERSIONING = REQUIRED
ACTIVATION_STATUS = REQUIRED
AUDIT = REQUIRED
VISIBILITY = RESOURCES_ADMINISTRATION
SNAPSHOT_BEHAVIOR = FREEZE_RESOLVED_IDENTITY
PERMISSION_MODEL = ADVANCED
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED when a quantity requires the resource
```

Resource identity is not a price and not a technical quantity.

### COST_EVIDENCE

Numeric cost facts for a resource. Confirmation is verification, not calculability.

```text
OWNER_DOMAIN = RESOURCES / COST
ALLOWED_SCOPE = RESOURCE + QUALIFIER + EFFECTIVE_PERIOD
EDITABILITY = OWNER_CONFIRMED_COST
ALLOWED_OVERRIDES = NONE as configuration override; replacement is a new evidence version
OVERRIDE_POLICY = EFFECTIVE_PERIOD_AND_QUALIFIER
TYPE_SAFETY = MONEY + UNIT
UNIT_SAFETY = REQUIRED
VALIDATION = FAIL_CLOSED
VERSIONING = REQUIRED
ACTIVATION_STATUS = REQUIRED
AUDIT = REQUIRED
VISIBILITY = RESOURCES_ADMINISTRATION
SNAPSHOT_BEHAVIOR = FREEZE_USED_EVIDENCE
PERMISSION_MODEL = ADVANCED
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED_FOR_DEPENDENT_CALCULATION
```

```text
COST_CALCULABILITY != COST_VERIFICATION
NUMERIC_NEEDS_VERIFICATION = USABLE_FOR_CALCULATION
MISSING_NUMERIC_VALUE = FAIL_CLOSED_FOR_DEPENDENT_CALCULATION
NO_SILENT_ZERO = YES
PROVISIONAL_PROVENANCE_MUST_REMAIN_VISIBLE = YES
```

A confirmed numeric cost is calculable. A numeric cost that needs verification is also calculable and must stay visibly unverified; it does not block quote freeze by itself. A missing numeric cost must not become zero and blocks only the calculation that depends on it.

### COMMERCIAL_RULE

Changeable commercial policy: markup, VAT, discount defaults, adjustments.

```text
OWNER_DOMAIN = COMMERCIAL
ALLOWED_SCOPE = typically ORGANIZATION; never a technical setting
EDITABILITY = ORGANIZATION_ADMIN for basic policy fields
ALLOWED_OVERRIDES = ONLY_IF_THE_COMMERCIAL_DEFINITION_ALLOWS
OVERRIDE_POLICY = EXPLICIT_PER_DEFINITION
TYPE_SAFETY = TYPED
UNIT_SAFETY = PERCENT or MONEY
VALIDATION = FAIL_CLOSED
VERSIONING = REQUIRED
ACTIVATION_STATUS = REQUIRED
AUDIT = REQUIRED
VISIBILITY = COMMERCIAL_ADMINISTRATION
SNAPSHOT_BEHAVIOR = FREEZE_POLICY_ID_VERSION_AND_RESOLVED_AMOUNTS
PERMISSION_MODEL = BASIC for ordinary policy; ADVANCED for unusual commercial formulas
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED
```

Currency and rounding that are not yet configurable remain `FIXED_VISIBLE_INFORMATION`. They must stay visible. They must not stay silent constants.

Current source-held evidence, as migration targets only:

- `DEFAULT_COMMERCIAL_POLICY.markupPercent = 35`
- `DEFAULT_COMMERCIAL_POLICY.vatPercent = 21`
- `COMMERCIAL_CURRENCY = EUR`
- `COMMERCIAL_ROUNDING = 0.01`

Replacing `35` with another TypeScript literal is not Configuration-First.

### FORMULA_DEFINITION

See §7. Configurable formulas have a dedicated contract. They are not stored as opaque strings inside a mega settings blob.

```text
OWNER_DOMAIN = FORMULA / CALCULATION, consumed by the declaring domain
ALLOWED_SCOPE = DECLARED_BY_DEFINITION
EDITABILITY = ADVANCED
ALLOWED_OVERRIDES = ONLY_IF_DEFINITION_ALLOWS
OVERRIDE_POLICY = EXPLICIT_PER_DEFINITION
TYPE_SAFETY = TYPED_EXPRESSION
UNIT_SAFETY = REQUIRED
VALIDATION = FAIL_CLOSED including cycle and reference checks
VERSIONING = REQUIRED
ACTIVATION_STATUS = REQUIRED
AUDIT = REQUIRED
VISIBILITY = ADVANCED_ADMINISTRATION + EXPLANATION
SNAPSHOT_BEHAVIOR = FREEZE_FORMULA_ID_VERSION_AND_RESOLVED_RESULT
PERMISSION_MODEL = ADVANCED
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED
```

### JOB_INPUT

Case-specific operator facts. Not configuration.

```text
OWNER_DOMAIN = JOB / OPERATOR INPUT
ALLOWED_SCOPE = QUOTE_DRAFT / JOB
EDITABILITY = OPERATOR on the job
ALLOWED_OVERRIDES = NONE as configuration
OVERRIDE_POLICY = NOT_APPLICABLE
TYPE_SAFETY = TYPED
UNIT_SAFETY = DECLARED
VALIDATION = PRODUCT_FORM_AND_ENGINE
VERSIONING = JOB_REVISION_NOT_CONFIG_VERSION
ACTIVATION_STATUS = CONFIRMED_IN_PRODUCT_TRUTH
AUDIT = JOB_AND_TRUTH_PROVENANCE
VISIBILITY = OPERATOR_UI
SNAPSHOT_BEHAVIOR = FREEZE_CONFIRMED_INPUTS
PERMISSION_MODEL = NORMAL_OPERATOR
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED for required measurements
```

### DERIVED_VALUE

Engine-computed result from configuration, formulas, and job inputs.

```text
OWNER_DOMAIN = ENGINE EVALUATION
ALLOWED_SCOPE = NOT_STORED_AS_INDEPENDENT_SETTING
EDITABILITY = NOT_DIRECTLY_EDITABLE
ALLOWED_OVERRIDES = NONE
OVERRIDE_POLICY = NONE
TYPE_SAFETY = TYPED
UNIT_SAFETY = DECLARED
VALIDATION = ENGINE
VERSIONING = FOLLOWS_INPUTS_AND_FORMULAS
ACTIVATION_STATUS = COMPUTED
AUDIT = EXPLANATION / BREAKDOWN
VISIBILITY = OPERATOR_AND_ADMIN
SNAPSHOT_BEHAVIOR = FREEZE_RESOLVED_RESULT
PERMISSION_MODEL = READ
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED or PARTIAL per existing engine completeness
```

Examples: LED module quantity, LED load, commercial net / VAT / gross, EIC lines.

### FIXED_VISIBLE_INFORMATION

A business-relevant fact that is not yet safely configurable.

```text
OWNER_DOMAIN = CODE, with documented visibility
ALLOWED_SCOPE = PLATFORM_OR_ENGINE_CONTRACT
EDITABILITY = SOURCE_CHANGE until a later configuration migration
ALLOWED_OVERRIDES = NONE
OVERRIDE_POLICY = NONE
TYPE_SAFETY = TYPED
UNIT_SAFETY = DECLARED
VALIDATION = ENGINE
VERSIONING = ENGINE_OR_DOCUMENTED_CONSTANT_IDENTITY
ACTIVATION_STATUS = VISIBLE
AUDIT = SOURCE_AND_DOCUMENTATION
VISIBILITY = REQUIRED in administration or documentation
SNAPSHOT_BEHAVIOR = TRACE_THE_VISIBLE_VALUE
PERMISSION_MODEL = DOCUMENTED
MISSING_VALUE_BEHAVIOR = NOT_APPLICABLE
```

This is a temporary honesty class, not the desired end state for changeable values.

### FIXED_VISIBLE_ENGINE_FORMULA

A code-owned algorithm that is too complex or unsafe for the V1 formula language.

```text
OWNER_DOMAIN = CODE / DOMAIN
ALLOWED_SCOPE = ENGINE_CONTRACT
EDITABILITY = SOURCE_CHANGE
ALLOWED_OVERRIDES = NONE
OVERRIDE_POLICY = NONE
TYPE_SAFETY = DECLARED_INPUTS_AND_OUTPUTS
UNIT_SAFETY = DECLARED
VALIDATION = ENGINE
VERSIONING = STABLE_FORMULA_ID + CONTRACT_IDENTITY
ACTIVATION_STATUS = VISIBLE
AUDIT = PROVENANCE
VISIBILITY = REQUIRED Romanian operator / admin explanation
SNAPSHOT_BEHAVIOR = FREEZE_FORMULA_ID_AND_RESULT
PERMISSION_MODEL = DOCUMENTED
MISSING_VALUE_BEHAVIOR = FAIL_CLOSED
```

Complex algorithms may remain code. They may not remain silent.

### FROZEN_SNAPSHOT_VALUE

The exact resolved configuration used by a confirmed quote, job, or production record.

```text
OWNER_DOMAIN = SNAPSHOT of the originating domain
ALLOWED_SCOPE = THE_FROZEN_RECORD
EDITABILITY = IMMUTABLE
ALLOWED_OVERRIDES = NONE
OVERRIDE_POLICY = NONE
TYPE_SAFETY = FROZEN_TYPED_COPY
UNIT_SAFETY = FROZEN
VALIDATION = ALREADY_VALIDATED_AT_FREEZE
VERSIONING = SNAPSHOT_SCHEMA + SOURCE_VERSIONS
ACTIVATION_STATUS = FROZEN
AUDIT = FREEZE_PROVENANCE
VISIBILITY = READ_ONLY
SNAPSHOT_BEHAVIOR = THIS_CLASS_IS_THE_SNAPSHOT
PERMISSION_MODEL = READ
MISSING_VALUE_BEHAVIOR = RECORD_ALREADY_FAILED_CLOSED_OR_IS_COMPLETE
```

Later configuration edits affect future work only.

## 6. Resolution model

```text
NO_UNIVERSAL_PRECEDENCE = YES
ALLOWED_SCOPES = EXPLICIT_PER_DEFINITION
OVERRIDE_POLICY = EXPLICIT_PER_DEFINITION
OWNER_DOMAIN = EXPLICIT_PER_DEFINITION
```

The resolver:

1. loads the definition
2. verifies the requested scope is in `allowedScopes`
3. applies only overrides listed by `overridePolicy`
4. records provenance: value, version, scope, effective time, actor
5. fails closed on missing required configuration, type mismatch, unit mismatch, inactive version, or unauthorized override

Examples:

- VAT / commercial policy may be organization-owned.
- Product geometry policy may be product-family or variant-owned.
- Resource cost evidence remains Resources / Cost-owned.
- Job inputs are not configuration overrides.

Unknown is not zero. A missing required value is not a silent fallback.

```text
UNKNOWN != ZERO
MISSING_REQUIRED_CONFIG = FAIL_CLOSED
SILENT_FALLBACK = NO
OPTIONAL_BUSINESS_AUTOMATION_MUST_NOT_CREATE_DEAD_END = YES
SAFE_MANUAL_FALLBACK = REQUIRED_WHERE_SEMANTICALLY_VALID
```

`MISSING_REQUIRED_CONFIG = FAIL_CLOSED` applies to genuinely required truth and integrity: tenancy, snapshot immutability, invalid commercial policy saves, and required technical facts for production.

Optional business automation may use an explicit supported manual or basic mode. A missing required numeric cost value makes cost-plus unavailable. A present numeric cost that still needs verification remains usable for calculation and must stay visibly unverified. It does not automatically make a valid authorized manual product price unavailable.

## 7. Formula architecture

Configurable formulas are not architecturally deferred.

```text
FORMULA_DEFINITION_CONTRACT = INCLUDED
CONFIGURABLE_FORMULA = INCLUDED
FIXED_VISIBLE_ENGINE_FORMULA = INCLUDED
```

### A. CONFIGURABLE_FORMULA

Requirements:

- typed
- unit-aware
- versioned
- auditable
- deterministic
- safe
- snapshottable
- explainable
- no arbitrary executable code

V1 expression capability must be architecturally able to express:

- numeric constants
- typed references
- configuration references
- job-input references
- `+ - * /`
- `min` `max` `ceil` `floor` `round`
- comparisons
- simple `IF` conditions

The evaluator must address:

- type mismatch
- unit mismatch
- missing input
- missing config
- invalid reference
- division by zero
- cycles
- version resolution
- activation status
- rollback / version replacement
- audit
- snapshot
- explanation / breakdown

Never:

```text
eval
exec
user JavaScript
user Python
shell execution
arbitrary executable expressions
```

Simple legitimate business formulas must not permanently require TypeScript edits.

Current lighting arithmetic is evidence, not an implementation task in this wave:

- module quantity = `ceil(perimeterMm / ledPitchMm)`
- LED load = `modules × ledModulePowerW`
- PSU minimum = `ledLoad × (1 + psuReservePercent / 100)`

Those are migration candidates for `CONFIGURABLE_FORMULA`. Changing `0.75` to another source literal is not the goal.

### B. FIXED_VISIBLE_ENGINE_FORMULA

Use when the algorithm is too complex or unsafe for the V1 language.

Requirements:

- stable `formulaId`
- code-owned deterministic implementation
- Romanian operator / admin explanation
- declared inputs, outputs, and units
- provenance
- version / contract identity where needed
- visible existence in administration or documentation
- snapshot / result traceability

Deterministic catalog selection, complex geometry, and state-machine transitions may remain code if they stay visible.

## 8. Product variant model

```text
FINITE_SAFE_CONFIGURATION = YES
UNBOUNDED_NO_CODE_ERP_BUILDER = NO
```

Product variants should be data when their differences are business configuration. Do not invent a generic product-graph editor for every future product.

Current Product System already distinguishes families, categories, templates, component types, display metadata, and technical settings. Display labels are already organization-persisted. Commercial policy is organization-versioned (CF1). The three LIGHTING_FRONT_LED settings `ledPitchMm`, `ledModulePowerW`, and `psuReservePercent` are organization-versioned (CF2+CF3). Remaining technical / business values stay source-held until a later authorized wave. That split is the migration problem, not a second Product System.

## 9. New organization bootstrap

```text
PLATFORM STARTER CONFIGURATION
→ copied / versioned into a newly created organization
→ organization receives its own version
→ business-critical fields may start NEEDS_CONFIRMATION
→ organization owns future edits
```

```text
LIVE_PLATFORM_INHERITANCE = NO
FAIL_CLOSED = YES
NO_SILENT_ZERO = YES
NO_SILENT_FALLBACK = YES
```

A later platform default change must not silently rewrite existing organizations.

Current bootstrap evidence, as migration context only:

- `NEW_ORGANIZATION` / `SYNTHETIC_TEST` use an empty provider foundation
- `ADOPT_EXISTING` currently uses HUB MEDIA workcenter compatibility as first-pilot compatibility, not permanent law
- new organizations may calculate from numeric cost evidence that still needs verification; a missing numeric cost fails closed for the dependent calculation and must not become a silent zero

HUB MEDIA must not become the starter law for every organization.

## 10. Versioning and snapshot immutability

Configuration must support:

- organization scope where applicable
- typed values
- validation
- versions
- audit
- effective activation
- resolved provenance

When quote, job, or production truth is confirmed / frozen, freeze the exact resolved configuration used:

- what value or formula was used
- which version
- from which scope
- when it became effective
- who changed it, where relevant

```text
HISTORICAL_REWRITE = NO
SNAPSHOT_PROVENANCE = REQUIRED
VERSIONING = REQUIRED
AUDIT = REQUIRED
```

Current engine already freezes commercial policy id / version / amounts on quote snapshot and freezes technical settings, quantities, EIC, and production operations on accepted production snapshots. Configuration-First extends that honesty to the source of those values. It does not create a second snapshot authority.

## 11. Permissions

```text
BASIC BUSINESS CONFIGURATION = ORGANIZATION OWNER / ADMIN
ADVANCED PRODUCT / FORMULA / RESOURCE CONFIGURATION = EXPLICIT ADVANCED PERMISSION
PLATFORM OWNER = PLATFORM CONTRACTS AND STARTER DEFAULTS
```

Platform Owner must not silently mutate private organization business configuration.

```text
NORMAL_CUSTOMER_REQUIRES_CURSOR = NO
NORMAL_CUSTOMER_REQUIRES_SOURCE_ACCESS = NO
NORMAL_CUSTOMER_REQUIRES_TERMINAL = NO
NORMAL_CUSTOMER_REQUIRES_DIRECT_DB_EDIT = NO
CUSTOMER_WITHOUT_CURSOR = REQUIRED
```

## 12. Commercial configuration

Commercial policy belongs in the same Configuration-First program.

Markup, VAT, discount / default policies, and other legitimately changeable commercial rules must not permanently require source edits.

Preserve:

```text
TECHNICAL_QUANTITY
!= RESOURCE_IDENTITY
!= COST_EVIDENCE
!= COMMERCIAL_PRICE
```

Commercial administration is Commercial-owned. It is not a generic technical-settings page.

## 13. Current source-held values

The architectural problem is source-held mutability, not a list of preferred replacement numbers.

Current source-held technical, commercial, and product values are migration targets for CF5. Examples of the class of problem, not a work list authorized here:

- LED pitch, LED module power, and PSU reserve live in domain source while already labeled configurable
- default commercial markup and VAT live in domain source
- EUR currency and 0.01 rounding are fixed V1 constraints and must remain visible until they have a configuration contract
- HUB MEDIA-specific catalogs and evidence must not be promoted to platform constants

```text
CHANGEABLE_BUSINESS_VALUES_IN_SOURCE = MIGRATION_TARGET_NOT_DESIRED_END_STATE
NUMBER_SWAP_IN_TYPESCRIPT = NOT_CONFIGURATION_FIRST
```

## 14. Administration direction

Do not design a giant global Settings page.

Configuration administration is domain-owned, with progressive disclosure:

| Surface | Owns |
| --- | --- |
| Product / Production | technical settings, variants, formula relationships |
| Resources / Cost | resources and cost evidence |
| Commercial | markup / VAT / discount / default commercial policy |
| Organization | organization-level defaults and capabilities |

Advanced configuration must not obstruct simple organizations.

Recorded admin-tooling debt in `docs/ROADMAP.md` remains recorded, not implemented, unless a later Owner GO says otherwise.

## 15. Smart modularity

Required behavior:

| Scenario | Required result |
| --- | --- |
| Advanced production company using full configuration | Domain-owned administration; advanced permission; no source edit |
| Small company using simple / manual flow | Progressive disclosure; unused advanced capability stays out of the way |
| Organization not using an advanced capability | Unrelated flows remain usable |
| Organization enabling that capability later | Own copied versions; confirmation where required; no historical rewrite |
| Configuration changed after an accepted quote / job | Future work only; frozen snapshots stay immutable |

```text
NO_CLIENT_SPECIFIC_CODE_FORK = YES
CUSTOMER_OPERABLE_WITHOUT_CURSOR = YES
OPTIONAL_CAPABILITY_DOES_NOT_BLOCK_UNRELATED_FLOW = YES
NO_HISTORICAL_REWRITE = YES
DOMAIN_OWNED_ADMINISTRATION = YES
PROGRESSIVE_DISCLOSURE = YES
UNKNOWN != ZERO
MISSING_REQUIRED_CONFIG = FAIL_CLOSED
```

## 16. Persistence boundary

This document may describe likely future additive needs. It must not be read as a schema.

Likely later persistence responsibilities, each still domain-owned:

- typed configuration definitions and versions
- organization-copied starter versions
- activation / effective period
- audit records
- snapshot references from quote / job / production records back to resolved configuration identity
- formula definitions distinct from technical settings and commercial rules

Constraints already in force:

- real data stays outside Git
- `WORKOS_CLOUD_ROOT` remains external
- one operational plane per organization
- do not add `organization_id` to operational tables
- do not touch schema, migrations, seeds, or real databases in this wave

```text
FUTURE_SCHEMA_OR_MIGRATION = REQUIRES_OWNER_DB_GO
```

## 17. Program sequence

Living program authority remains `docs/ROADMAP.md`.

```text
CF0  CONFIGURATION-FIRST CANON / DOCUMENTATION
CF1  TYPED CONFIGURATION DOMAIN + PERSISTENCE FOUNDATION
CF2  RESOLVER + VERSION + AUDIT + SNAPSHOT PROVENANCE
CF3  BASIC ADMINISTRATION FOR TECHNICAL / COMMERCIAL / VARIANT CONFIGURATION
CF4  SAFE CONFIGURABLE FORMULA FOUNDATION + ADMINISTRATION
CF5  MIGRATE CURRENT SOURCE-HELD CHANGEABLE BUSINESS SETTINGS / RULES
```

After CF5, resume in the living roadmap:

- Letters Product Truth
- ACM Product Truth
- member DAG corrections
- Letters + ACM composition
- execution expansion
- planning / capacity

```text
CF1_COMMERCIAL_VERTICAL_V1 = COMPLETE
CF1_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2 = COMPLETE
CF3 = COMPLETE
CF2_CF3_TECHNICAL_CONFIGURATION_V1 = COMPLETE
CF2_CF3_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_INTEGRATED_ON_MAIN = YES
CF2_CF3_MERGE = COMPLETE
PR_10 = MERGED
CF4 = NOT_STARTED
CF5 = NOT_STARTED
CF4_OR_LATER = NOT_AUTHORIZED_BY_THIS_DOCUMENT
NEXT_WAVE_AUTHORIZED = NO
```

## 18. Acceptance

```text
CONFIGURATION_FIRST_DIRECTION = CANONICAL
NO_SILENT_BUSINESS_TRUTH = CANONICAL
CHANGEABLE_BUSINESS_VALUES_IN_SOURCE = MIGRATION_TARGET_NOT_DESIRED_END_STATE
FORMULA_DEFINITION_CONTRACT = INCLUDED
CONFIGURABLE_FORMULA = INCLUDED
FIXED_VISIBLE_ENGINE_FORMULA = INCLUDED
DOMAIN_OWNED_CONFIGURATION = INCLUDED
SHARED_RESOLUTION_SEMANTICS = INCLUDED
GENERIC_MEGA_SETTINGS_BLOB = REJECTED
ALLOWED_SCOPES = EXPLICIT_PER_DEFINITION
OVERRIDE_POLICY = EXPLICIT_PER_DEFINITION
OWNER_DOMAIN = EXPLICIT_PER_DEFINITION
VERSIONING = REQUIRED
AUDIT = REQUIRED
SNAPSHOT_PROVENANCE = REQUIRED
HISTORICAL_REWRITE = NO
CUSTOMER_WITHOUT_CURSOR = REQUIRED
PRIMARY_USER_JOURNEY = COMPLETE
NEXT_PROGRAM = WORKOS_CONFIGURATION_FIRST_FOUNDATION_V1
FUNCTIONAL_WORKOS_FIRST = YES
OPTIONAL_BUSINESS_AUTOMATION_MUST_NOT_CREATE_DEAD_END = YES
SAFE_MANUAL_FALLBACK = REQUIRED_WHERE_SEMANTICALLY_VALID
IMPLEMENTATION_AUTHORIZED = CF1_COMPLETE_AND_CF2_CF3_COMPLETE
DB_IMPLEMENTATION_AUTHORIZED = COMMERCIAL_POLICY_VERSIONS_AND_TECHNICAL_SETTING_VERSIONS
CF1_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_OWNER_ACCEPTED_IMPLEMENTATION = YES
CF2_CF3_INTEGRATED_ON_MAIN = YES
NEXT_WAVE_AUTHORIZED = NO
FORMULA_CONFIGURABILITY_FULLY_DELIVERED = NO
```

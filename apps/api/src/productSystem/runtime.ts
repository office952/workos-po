import {
  presentProductSystem,
  type AcceptedProductionSnapshot,
  type DisplayLabelCatalog,
  type ExecutionPlanRecord,
  type InventoryItemDetail,
  type InventoryStockProjection,
  type Customer,
  type CustomerMutationResult,
  type CustomerProfilePatch,
  type CustomerRegistryProjection,
  type CustomerWorkspaceProjection,
  jobsForCustomer,
  projectCustomerRegistry,
  projectCustomerRegistryItem,
  projectCustomerWorkspace,
  quotesForCustomer,
  requestsForCustomer,
  type SellerMutationResult,
  type SellerProfile,
  type SellerProfileInput,
  diagnoseEligibility,
  type PeopleEligibilityContext,
  type PeopleRegistryProjection,
  type Person,
  type PersonEligibilityDiagnosis,
  type PersonMutationResult,
  type PersonProfilePatch,
  type PersonSkillMutationResult,
  type OperatorCandidate,
  type OperatorSessionRecord,
  type OperatorTaskInboxProjection,
  resolveEligiblePeople,
  type Skill,
  type SkillMutationResult,
  projectExecutionPlanView,
  projectOperatorTaskInbox,
  projectJobOverview,
  projectJobOverviewItem,
  projectQuoteOverview,
  projectQuoteOverviewItem,
  projectRequestDetail,
  projectRequestOverview,
  projectRequestOverviewItem,
  commercialRequestReference,
  canUploadRequestAttachment,
  generateAttachmentId,
  projectRequestAttachment,
  MAX_REQUEST_ATTACHMENT_BYTES,
  type CommercialRequest,
  type CommercialRequestAttachment,
  type CommercialRequestLinkResult,
  type CommercialRequestMutationResult,
  type CommercialRequestStatus,
  type JobOverviewProjection,
  type QuoteOverviewProjection,
  type RequestAttachmentError,
  type RequestAttachmentProjection,
  type RequestDetailProjection,
  type RequestOverviewProjection,
  type SiteInstallationFactsMutationResult,
  type SiteInstallationFactsPatch,
  type OperationalServiceProviderMode,
  type OperationalServicesAdminProjection,
  type OrganizationServiceOfferMutationResult,
  type OrderSnapshot,
  type QuoteAcceptanceDecision,
  type QuoteSnapshot,
  type TaskCompletionInput,
  type TaskMutationResult,
  projectResourcesAdministration,
  siteInstallationEvidenceFromRows,
  type CostEvidence,
  type ResourcesAdministrationWriteStats,
  type ResourcesAdminProjection,
  workcenterRegistry,
  type WorkcenterRegistry,
} from "@workos-final/domain";
import {
  applyOperationalBootstrap,
  resolveProviderRegistry,
  resolveProviderRegistryKind,
  type ProviderRegistryKind,
} from "../cloud/bootstrapPolicy.js";
import { loadOrganizationProviderRegistry } from "../workcenters/organizationProviderStore.js";
import type { BootstrapPolicy } from "../cloud/controlPlane.js";
import {
  applyMigrations,
  openSqliteDatabase,
  openSqliteDatabaseWithoutMigrations,
  resolveProductSystemSqlitePath,
  type SqliteDatabase,
} from "../persistence/sqlite.js";
import {
  getExecutionPlanByTaskId,
  getExecutionPlanBySnapshotId,
  getExecutionPlanRecord,
  insertExecutionPlanRecord,
  listOpenExecutionPlanRecords,
  persistAssignedExecutor,
  persistAssignedProvider,
  persistClaimAndStart,
  persistTaskComplete,
  persistTaskStart,
} from "../execution/store.js";
import {
  persistInventoryAdjustment,
  readInventoryItem,
  readInventoryProjection,
  type InventoryAdjustmentResult,
} from "../inventory/store.js";
import {
  getCustomer,
  listCustomers,
  persistCreatedCustomer,
  persistRenamedCustomer,
  persistRetiredCustomer,
  persistUpdatedCustomer,
} from "../customers/store.js";
import { getSellerProfile, persistUpdatedSeller, readSellerProfile } from "../seller/store.js";
import {
  ensureTrustedWorkforce,
  getPerson,
  listPeople,
  persistAssignedPersonSkill,
  persistCreatedPerson,
  persistCreatedSkill,
  persistRenamedPerson,
  persistRenamedSkill,
  persistRetiredPerson,
  persistRetiredPersonSkill,
  persistRetiredSkill,
  persistUpdatedPerson,
  readPeopleEligibilityContext,
  runtimePeopleEligibilityContext,
  readPeopleRegistry,
  listSkills,
} from "../people/store.js";
import {
  identifyOperator,
  listOperatorCandidates,
  logoutOperatorSession,
  personHasOperatorPin,
  resolveOperatorSession,
  setOperatorPin,
  createDevOperatorSession,
} from "../operator/store.js";
import {
  getOrderSnapshot,
  getOrderSnapshotByQuoteSnapshotId,
  getQuoteAcceptanceBySnapshotId,
  getQuoteSnapshot,
  listOrderSnapshots,
  listQuoteSnapshots,
  insertOrderSnapshot,
  insertQuoteAcceptance,
  insertQuoteSnapshot,
} from "../commercial/store.js";
import {
  getAcceptedProductionSnapshot,
  getAcceptedProductionSnapshotByOrder,
  insertAcceptedProductionSnapshot,
} from "../production/store.js";
import {
  getCommercialRequest,
  getCommercialRequestAttachment,
  getCommercialRequestQuoteLinkByQuote,
  insertCommercialRequestAttachment,
  listCommercialRequestAttachments,
  listCommercialRequestQuoteLinks,
  listCommercialRequests,
  persistCommercialRequestQuoteLink,
  persistCreatedCommercialRequest,
  persistInstallationManualPrice,
  persistUpdatedCommercialRequest,
} from "../requests/store.js";
import {
  getInstallationFacts,
  persistUpdatedInstallationFacts,
} from "../requests/installationFacts.js";
import {
  persistOrganizationServiceOffer,
  readOperationalServicesAdmin,
  readOrganizationServiceOffer,
} from "../operationalServices/store.js";
import {
  readRequestAttachmentBytes,
  removeRequestAttachmentFile,
  resolveDocumentsRoot,
  writeRequestAttachmentBytes,
  attachmentIntegrityMatches,
} from "../requests/attachmentStorage.js";
import { createProductSystemPresentationReuse } from "./presentationReuse.js";
import { createResourcesAdministrationReuse } from "./resourcesAdministrationReuse.js";
import {
  loadDisplayLabelCatalog,
  updateDisplayLabel,
  type DisplayLabelWriteResult,
} from "./store.js";
import {
  createInitialCostEvidence as persistInitialCostEvidence,
  listActiveCostEvidence as readActiveCostEvidence,
  supersedeCostEvidence as persistSupersededCostEvidence,
  type CostEvidenceWriteResult,
} from "../resources/store.js";
import {
  assertPlaneIdentity,
  bindOperationalPlaneIdentity,
  readOperationalPlaneIdentity,
} from "../cloud/planeIdentity.js";

export type ProductSystemRuntime = {
  sqlitePath: string;
  documentsRoot: string;
  labels(): DisplayLabelCatalog;
  present(): ReturnType<typeof presentProductSystem>;
  updateDisplayLabel(
    entityKind: string,
    entityId: string,
    displayLabel: unknown,
    expectedRevision?: number,
  ): DisplayLabelWriteResult;
  acceptProductionSnapshot(snapshot: AcceptedProductionSnapshot): {
    created: boolean;
    snapshot: AcceptedProductionSnapshot;
  };
  readProductionSnapshot(snapshotId: string): AcceptedProductionSnapshot | null;
  readProductionReleaseByOrder(orderSnapshotId: string): AcceptedProductionSnapshot | null;
  persistQuoteSnapshot(snapshot: QuoteSnapshot): {
    created: boolean;
    snapshot: QuoteSnapshot;
  };
  readQuoteSnapshot(quoteSnapshotId: string): QuoteSnapshot | null;
  persistQuoteAcceptance(decision: QuoteAcceptanceDecision): {
    created: boolean;
    decision: QuoteAcceptanceDecision;
  };
  readQuoteAcceptance(quoteSnapshotId: string): QuoteAcceptanceDecision | null;
  persistOrderSnapshot(snapshot: OrderSnapshot): {
    created: boolean;
    snapshot: OrderSnapshot;
  };
  readOrderSnapshot(orderSnapshotId: string): OrderSnapshot | null;
  readOrderSnapshotByQuote(quoteSnapshotId: string): OrderSnapshot | null;
  persistExecutionPlan(record: ExecutionPlanRecord): {
    created: boolean;
    record: ExecutionPlanRecord;
  };
  readExecutionPlan(planId: string): ExecutionPlanRecord | null;
  readExecutionPlanBySnapshot(snapshotId: string): ExecutionPlanRecord | null;
  readExecutionPlanByTaskId(taskId: string): ExecutionPlanRecord | null;
  assignExecutionTaskProvider(taskId: string, providerId: string): TaskMutationResult;
  assignExecutionTaskExecutor(taskId: string, personId: string): TaskMutationResult;
  startExecutionTask(taskId: string): TaskMutationResult;
  claimAndStartExecutionTask(taskId: string, personId: string): TaskMutationResult;
  completeExecutionTask(
    taskId: string,
    input?: TaskCompletionInput,
    actorPersonId?: string | null,
  ): TaskMutationResult;
  listOperatorCandidates(): OperatorCandidate[];
  setOperatorPin(
    personId: string,
    pin: string,
    confirmPin: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  identifyOperator(
    personId: string,
    pin: string,
  ): Promise<
    | {
        ok: true;
        person: Person;
        session: OperatorSessionRecord;
        rawToken: string;
      }
    | { ok: false; error: string }
  >;
  createDevOperatorSession(env?: NodeJS.ProcessEnv):
    | {
        ok: true;
        person: Person;
        session: OperatorSessionRecord;
        rawToken: string;
      }
    | { ok: false; error: string };
  resolveOperatorSession(rawToken: string | undefined | null):
    | {
        ok: true;
        person: Person;
        session: OperatorSessionRecord;
      }
    | { ok: false; error: string };
  logoutOperatorSession(rawToken: string | undefined | null): void;
  personHasOperatorPin(personId: string): boolean;
  getOperatorTaskInbox(personId: string): OperatorTaskInboxProjection | null;
  readInventory(): InventoryStockProjection;
  readInventoryItem(resourceId: string): InventoryItemDetail | null;
  recordInventoryAdjustment(
    resourceId: string,
    quantityDelta: number,
    note?: string,
  ): InventoryAdjustmentResult;
  listActiveCostEvidence(): CostEvidence[];
  resourcesAdministration(): ResourcesAdminProjection;
  supersedeCostEvidence(
    evidenceRowId: string,
    amount: unknown,
    note: unknown,
    extras?: {
      supplierLabel?: unknown;
      validFrom?: unknown;
      validUntil?: unknown;
    },
  ): CostEvidenceWriteResult;
  createInitialCostEvidence(input: {
    resourceId: string;
    amount: unknown;
    note?: unknown;
    when?: unknown;
    supplierLabel?: unknown;
    validFrom?: unknown;
    validUntil?: unknown;
  }): CostEvidenceWriteResult;
  listPeople(): Person[];
  getPerson(personId: string): Person | null;
  listPeopleRegistry(): PeopleRegistryProjection;
  listSkills(): Skill[];
  peopleEligibilityContext(): PeopleEligibilityContext | null;
  readEligibility(capabilityId: string): {
    eligiblePeople: Array<{ personId: string; displayName: string }>;
    diagnoses: readonly PersonEligibilityDiagnosis[];
  };
  createSkill(input: {
    code: string;
    displayLabel: string;
    description?: string | null;
  }): SkillMutationResult;
  renameSkill(skillId: string, displayLabel: string): SkillMutationResult;
  retireSkill(skillId: string): SkillMutationResult;
  assignPersonSkill(personId: string, skillId: string): PersonSkillMutationResult;
  retirePersonSkill(personId: string, skillId: string): PersonSkillMutationResult;
  updatePerson(personId: string, patch: PersonProfilePatch): PersonMutationResult;
  materializeTrustedWorkforce(): void;
  listCustomers(): Customer[];
  getCustomer(customerId: string): Customer | null;
  listCustomerRegistry(): CustomerRegistryProjection;
  readCustomerWorkspace(customerId: string): CustomerWorkspaceProjection | null;
  getSellerProfile(): SellerProfile | null;
  bootstrapPolicy: BootstrapPolicy | null;
  providerRegistry: WorkcenterRegistry;
  providerRegistryKind: ProviderRegistryKind;
  updateSellerProfile(input: SellerProfileInput): SellerMutationResult;
  readOperationalServicesAdmin(): OperationalServicesAdminProjection;
  updateOrganizationServiceOffer(
    capabilityId: string,
    offerMode: string,
  ): OrganizationServiceOfferMutationResult;
  listJobOverview(): JobOverviewProjection;
  listQuoteOverview(): QuoteOverviewProjection;
  listRequestOverview(): RequestOverviewProjection;
  readCommercialRequest(requestId: string): CommercialRequest | null;
  readRequestDetail(requestId: string): RequestDetailProjection | null;
  listRequestAttachments(requestId: string): RequestAttachmentProjection[] | null;
  createRequestAttachment(
    requestId: string,
    input: {
      originalFileName: string;
      mimeType: string | null;
      bytes: Uint8Array;
    },
  ):
    | { ok: true; attachment: RequestAttachmentProjection }
    | { ok: false; error: RequestAttachmentError };
  readRequestAttachmentDownload(
    requestId: string,
    attachmentId: string,
  ):
    | {
        ok: true;
        attachment: CommercialRequestAttachment;
        bytes: Uint8Array;
      }
    | { ok: false; error: RequestAttachmentError };
  createCommercialRequest(
    customerId: string,
    title: string,
    description: string,
  ): CommercialRequestMutationResult;
  updateCommercialRequest(
    requestId: string,
    patch: {
      title?: string;
      description?: string;
      status?: CommercialRequestStatus;
      customerId?: string;
      optionalScopeIds?: readonly string[];
      siteInstallationMode?: OperationalServiceProviderMode | null;
      confirmDeleteInstallationFacts?: boolean;
    },
  ): CommercialRequestMutationResult;
  updateInstallationFacts(
    requestId: string,
    patch: SiteInstallationFactsPatch,
    expectedVersion: number,
  ): SiteInstallationFactsMutationResult;
  updateInstallationManualPrice(
    requestId: string,
    netPrice: number | null,
    isOwner: boolean,
  ): CommercialRequestMutationResult;
  linkRequestQuote(
    requestId: string,
    quoteSnapshotId: string,
  ): CommercialRequestLinkResult;
  createPerson(
    displayName: string,
    options?: { roleLabel?: string | null },
  ): PersonMutationResult;
  renamePerson(personId: string, displayName: string): PersonMutationResult;
  retirePerson(personId: string): PersonMutationResult;
  createCustomer(
    displayName: string,
    profile?: CustomerProfilePatch,
  ): CustomerMutationResult;
  updateCustomer(
    customerId: string,
    patch: CustomerProfilePatch,
  ): CustomerMutationResult;
  renameCustomer(customerId: string, displayName: string): CustomerMutationResult;
  retireCustomer(customerId: string): CustomerMutationResult;
  close(): void;
  organizationId: string | null;
  planeId: string | null;
  assertBoundPlaneIdentity(expected: {
    planeId: string;
    organizationId: string;
  }): void;
};

export type ProductSystemRuntimeOptions = {
  documentsRoot?: string;
  planeIdentity?: { planeId: string; organizationId: string };
  /** Provision may bind once. Request open must only assert. Defaults to bind. */
  bindPlaneIdentity?: boolean;
  bootstrapPolicy?: BootstrapPolicy;
  providerRegistry?: WorkcenterRegistry;
  observeDisplayLabelCatalogLoad?: () => void;
  observeProductSystemPresentationBuild?: () => void;
  observeActiveCostEvidenceLoad?: () => void;
  observeResourcesAdministrationBuild?: () => void;
  observeResourcesAdministrationDelta?: (
    stats: ResourcesAdministrationWriteStats,
  ) => void;
  now?: () => string;
};

export function createProductSystemRuntime(
  sqlitePath = resolveProductSystemSqlitePath(),
  options: ProductSystemRuntimeOptions = {},
): ProductSystemRuntime {
  if (options.planeIdentity && options.bindPlaneIdentity === false) {
    const db = openVerifiedCloudRequestDatabase(sqlitePath, options.planeIdentity);
    return createProductSystemRuntimeFromOpenDb(db, sqlitePath, options);
  }
  const db = openSqliteDatabase(sqlitePath);
  return createProductSystemRuntimeFromOpenDb(db, sqlitePath, options);
}

function openVerifiedCloudRequestDatabase(
  sqlitePath: string,
  expected: { planeId: string; organizationId: string },
): SqliteDatabase {
  const db = openSqliteDatabaseWithoutMigrations(sqlitePath);
  try {
    assertExistingPlaneIdentity(db, expected);
    applyMigrations(db);
    assertExistingPlaneIdentity(db, expected);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function createProductSystemRuntimeFromOpenDb(
  db: SqliteDatabase,
  sqlitePath: string,
  options: ProductSystemRuntimeOptions = {},
): ProductSystemRuntime {
  const documentsRoot = options.documentsRoot ?? resolveDocumentsRoot();
  let planeIdentity;
  try {
    planeIdentity = options.planeIdentity
      ? options.bindPlaneIdentity === false
        ? assertExistingPlaneIdentity(db, options.planeIdentity)
        : bindOperationalPlaneIdentity(db, options.planeIdentity)
      : readOperationalPlaneIdentity(db);
  } catch (error) {
    db.close();
    throw error;
  }
  if (options.bindPlaneIdentity === false) {
    if (!options.bootstrapPolicy || !options.providerRegistry) {
      db.close();
      throw new Error("cloud_request_runtime_requires_bootstrap_context");
    }
  }
  const bootstrapPolicy = options.bootstrapPolicy ?? null;
  const providerRegistryKind = resolveProviderRegistryKind(
    bootstrapPolicy ?? "SINGLE_PLANE",
  );
  const codeOrInjectedRegistry =
    options.providerRegistry ??
    (bootstrapPolicy
      ? resolveProviderRegistry(bootstrapPolicy)
      : workcenterRegistry);
  applyOperationalBootstrap(db, bootstrapPolicy ?? undefined);
  const eligibilityFailClosed = bootstrapPolicy !== null;
  const currentProviderRegistry = (): WorkcenterRegistry => {
    if (providerRegistryKind === "EMPTY_FOUNDATION") {
      return loadOrganizationProviderRegistry(db);
    }
    return codeOrInjectedRegistry;
  };
  const currentEligibility = () =>
    runtimePeopleEligibilityContext(db, {
      failClosedWhenUnmapped: eligibilityFailClosed,
    });
  const presentationReuse = createProductSystemPresentationReuse({
    loadLabels() {
      options.observeDisplayLabelCatalogLoad?.();
      return loadDisplayLabelCatalog(db);
    },
    present(labels) {
      options.observeProductSystemPresentationBuild?.();
      return presentProductSystem(labels);
    },
  });
  const resourcesReuse = createResourcesAdministrationReuse({
    loadEvidence() {
      options.observeActiveCostEvidenceLoad?.();
      return readActiveCostEvidence(db);
    },
    project(rows, asOf) {
      options.observeResourcesAdministrationBuild?.();
      return projectResourcesAdministration(rows, asOf);
    },
    now: options.now,
    observeDelta: options.observeResourcesAdministrationDelta,
  });
  return {
    sqlitePath,
    documentsRoot,
    organizationId: planeIdentity?.organizationId ?? null,
    planeId: planeIdentity?.planeId ?? null,
    bootstrapPolicy,
    get providerRegistry() {
      return currentProviderRegistry();
    },
    providerRegistryKind,
    labels: presentationReuse.labels,
    present: presentationReuse.present,
    updateDisplayLabel(entityKind, entityId, displayLabel, expectedRevision) {
      const result = updateDisplayLabel(
        db,
        entityKind,
        entityId,
        displayLabel,
        expectedRevision,
      );
      if (result.ok) {
        presentationReuse.invalidate();
      }
      return result;
    },
    acceptProductionSnapshot(snapshot) {
      return insertAcceptedProductionSnapshot(db, snapshot);
    },
    readProductionSnapshot(snapshotId) {
      return getAcceptedProductionSnapshot(db, snapshotId);
    },
    readProductionReleaseByOrder(orderSnapshotId) {
      return getAcceptedProductionSnapshotByOrder(db, orderSnapshotId);
    },
    persistQuoteSnapshot(snapshot) {
      return insertQuoteSnapshot(db, snapshot);
    },
    readQuoteSnapshot(quoteSnapshotId) {
      return getQuoteSnapshot(db, quoteSnapshotId);
    },
    persistQuoteAcceptance(decision) {
      return insertQuoteAcceptance(db, decision);
    },
    readQuoteAcceptance(quoteSnapshotId) {
      return getQuoteAcceptanceBySnapshotId(db, quoteSnapshotId);
    },
    persistOrderSnapshot(snapshot) {
      return insertOrderSnapshot(db, snapshot);
    },
    readOrderSnapshot(orderSnapshotId) {
      return getOrderSnapshot(db, orderSnapshotId);
    },
    readOrderSnapshotByQuote(quoteSnapshotId) {
      return getOrderSnapshotByQuoteSnapshotId(db, quoteSnapshotId);
    },
    persistExecutionPlan(record) {
      return insertExecutionPlanRecord(db, record);
    },
    readExecutionPlan(planId) {
      return getExecutionPlanRecord(db, planId);
    },
    readExecutionPlanBySnapshot(snapshotId) {
      return getExecutionPlanBySnapshotId(db, snapshotId);
    },
    readExecutionPlanByTaskId(taskId) {
      return getExecutionPlanByTaskId(db, taskId);
    },
    assignExecutionTaskProvider(taskId, providerId) {
      return persistAssignedProvider(db, taskId, providerId, currentProviderRegistry());
    },
    assignExecutionTaskExecutor(taskId, personId) {
      return persistAssignedExecutor(
        db,
        taskId,
        personId,
        listPeople(db),
        currentEligibility(),
      );
    },
    startExecutionTask(taskId) {
      return persistTaskStart(
        db,
        taskId,
        new Date().toISOString(),
        listPeople(db),
        currentEligibility(),
        currentProviderRegistry(),
      );
    },
    claimAndStartExecutionTask(taskId, personId) {
      return persistClaimAndStart(
        db,
        taskId,
        personId,
        new Date().toISOString(),
        listPeople(db),
        currentEligibility(),
        currentProviderRegistry(),
      );
    },
    listOperatorCandidates() {
      return listOperatorCandidates(db);
    },
    setOperatorPin(personId, pin, confirmPin) {
      return setOperatorPin(db, personId, pin, confirmPin);
    },
    identifyOperator(personId, pin) {
      return identifyOperator(db, personId, pin);
    },
    createDevOperatorSession(env) {
      return createDevOperatorSession(db, env);
    },
    resolveOperatorSession(rawToken) {
      return resolveOperatorSession(db, rawToken);
    },
    logoutOperatorSession(rawToken) {
      logoutOperatorSession(db, rawToken);
    },
    personHasOperatorPin(personId) {
      return personHasOperatorPin(db, personId);
    },
    getOperatorTaskInbox(personId) {
      const person = getPerson(db, personId);
      if (!person || person.status !== "ACTIVE") {
        return null;
      }
      const people = listPeople(db);
      const eligibility = currentEligibility();
      const openPlans = listOpenExecutionPlanRecords(db);
      const plans = openPlans.map((record) => {
        const snapshot = getAcceptedProductionSnapshot(db, record.plan.sourceSnapshotId);
        const orderId = snapshot?.sourceOrderSnapshotId;
        const order = orderId ? getOrderSnapshot(db, orderId) : null;
        return {
          record,
          snapshot,
          customerDisplayName: order?.customer?.displayName ?? null,
        };
      });
      return projectOperatorTaskInbox({
        currentOperator: person,
        people,
        eligibility,
        plans,
        providerRegistry: currentProviderRegistry(),
      });
    },
    listPeople() {
      return listPeople(db);
    },
    getPerson(personId) {
      return getPerson(db, personId);
    },
    listPeopleRegistry() {
      return readPeopleRegistry(db);
    },
    listSkills() {
      return listSkills(db);
    },
    peopleEligibilityContext() {
      return currentEligibility();
    },
    readEligibility(capabilityId) {
      const context = readPeopleEligibilityContext(db);
      const input = {
        capabilityId: capabilityId as Parameters<
          typeof resolveEligiblePeople
        >[0]["capabilityId"],
        people: listPeople(db),
        ...context,
      };
      return {
        eligiblePeople: resolveEligiblePeople(input),
        diagnoses: diagnoseEligibility(input),
      };
    },
    createSkill(input) {
      return persistCreatedSkill(db, input);
    },
    renameSkill(skillId, displayLabel) {
      return persistRenamedSkill(db, skillId, displayLabel);
    },
    retireSkill(skillId) {
      return persistRetiredSkill(db, skillId, new Date().toISOString());
    },
    assignPersonSkill(personId, skillId) {
      return persistAssignedPersonSkill(db, personId, skillId);
    },
    retirePersonSkill(personId, skillId) {
      return persistRetiredPersonSkill(db, personId, skillId, new Date().toISOString());
    },
    updatePerson(personId, patch) {
      return persistUpdatedPerson(db, personId, patch);
    },
    materializeTrustedWorkforce() {
      if (bootstrapPolicy) {
        return;
      }
      ensureTrustedWorkforce(db);
    },
    listCustomers() {
      return listCustomers(db);
    },
    getCustomer(customerId) {
      return getCustomer(db, customerId);
    },
    getSellerProfile() {
      return bootstrapPolicy
        ? readSellerProfile(db)
        : getSellerProfile(db, { lazyHubSeed: true });
    },
    updateSellerProfile(input) {
      return persistUpdatedSeller(db, input);
    },
    readOperationalServicesAdmin() {
      return readOperationalServicesAdmin(db);
    },
    updateOrganizationServiceOffer(capabilityId, offerMode) {
      return persistOrganizationServiceOffer(db, capabilityId, offerMode);
    },
    listJobOverview() {
      return projectJobOverview(jobOverviewItems(db, currentProviderRegistry(), currentEligibility()));
    },
    listQuoteOverview() {
      return projectQuoteOverview(quoteOverviewItems(db));
    },
    listRequestOverview() {
      return projectRequestOverview(requestOverviewItems(db));
    },
    listCustomerRegistry() {
      const requests = requestOverviewItems(db);
      const quotes = quoteOverviewItems(db);
      const jobs = jobOverviewItems(db, currentProviderRegistry(), currentEligibility());
      return projectCustomerRegistry(
        listCustomers(db).map((customer) =>
          projectCustomerRegistryItem({
            customer,
            requests: requestsForCustomer(requests, customer.customerId),
            quotes: quotesForCustomer(quotes, customer.customerId),
            jobs: jobsForCustomer(jobs, customer.customerId),
          }),
        ),
      );
    },
    readCustomerWorkspace(customerId) {
      const customer = getCustomer(db, customerId);
      if (!customer) {
        return null;
      }
      return projectCustomerWorkspace({
        customer,
        requests: requestsForCustomer(requestOverviewItems(db), customerId),
        quotes: quotesForCustomer(quoteOverviewItems(db), customerId),
        jobs: jobsForCustomer(
          jobOverviewItems(db, currentProviderRegistry(), currentEligibility()),
          customerId,
        ),
      });
    },
    readCommercialRequest(requestId) {
      return getCommercialRequest(db, requestId);
    },
    readRequestDetail(requestId) {
      const request = getCommercialRequest(db, requestId);
      if (!request) {
        return null;
      }
      return projectRequestDetail({
        request,
        customerDisplayName: getCustomer(db, request.customerId)?.displayName ?? null,
        quotes: linkedQuoteOverviewItems(db, request.requestId),
        attachments: listCommercialRequestAttachments(db, request.requestId),
        serviceOffer: readOrganizationServiceOffer(db),
        installationFacts: getInstallationFacts(db, request.requestId),
        installationEvidence: siteInstallationEvidenceFromRows(readActiveCostEvidence(db)),
      });
    },
    listRequestAttachments(requestId) {
      const request = getCommercialRequest(db, requestId);
      if (!request) {
        return null;
      }
      return listCommercialRequestAttachments(db, requestId).map(projectRequestAttachment);
    },
    createRequestAttachment(requestId, input) {
      const request = getCommercialRequest(db, requestId);
      if (!request) {
        return { ok: false, error: "not_found" };
      }
      if (!canUploadRequestAttachment(request.status)) {
        return { ok: false, error: "request_cancelled" };
      }
      const originalFileName = input.originalFileName.trim();
      if (!originalFileName || input.bytes.byteLength === 0) {
        return { ok: false, error: "invalid_file" };
      }
      if (input.bytes.byteLength > MAX_REQUEST_ATTACHMENT_BYTES) {
        return { ok: false, error: "file_too_large" };
      }
      let stored: { storageKey: string; sha256: string } | null = null;
      try {
        stored = writeRequestAttachmentBytes({
          requestId,
          bytes: input.bytes,
          documentsRoot,
        });
        const attachment: CommercialRequestAttachment = {
          attachmentId: generateAttachmentId(),
          requestId,
          originalFileName,
          mimeType: input.mimeType && input.mimeType.trim() ? input.mimeType.trim() : null,
          sizeBytes: input.bytes.byteLength,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          createdAt: new Date().toISOString(),
        };
        insertCommercialRequestAttachment(db, attachment);
        return { ok: true, attachment: projectRequestAttachment(attachment) };
      } catch {
        if (stored) {
          removeRequestAttachmentFile(requestId, stored.storageKey, documentsRoot);
        }
        return { ok: false, error: "storage_unavailable" };
      }
    },
    readRequestAttachmentDownload(requestId, attachmentId) {
      const request = getCommercialRequest(db, requestId);
      if (!request) {
        return { ok: false, error: "not_found" };
      }
      const attachment = getCommercialRequestAttachment(db, attachmentId);
      if (!attachment || attachment.requestId !== requestId) {
        return { ok: false, error: "not_found" };
      }
      const bytes = readRequestAttachmentBytes(
        requestId,
        attachment.storageKey,
        documentsRoot,
      );
      if (!bytes) {
        return { ok: false, error: "file_missing" };
      }
      if (!attachmentIntegrityMatches(bytes, attachment.sha256)) {
        return { ok: false, error: "file_corrupt" };
      }
      return { ok: true, attachment, bytes };
    },
    createCommercialRequest(customerId, title, description) {
      const customer = getCustomer(db, customerId);
      if (!customer) {
        return { ok: false, error: "customer_unavailable" };
      }
      return persistCreatedCommercialRequest(db, customer, title, description);
    },
    updateCommercialRequest(requestId, patch) {
      return persistUpdatedCommercialRequest(db, requestId, patch);
    },
    updateInstallationFacts(requestId, patch, expectedVersion) {
      return persistUpdatedInstallationFacts(db, requestId, patch, expectedVersion);
    },
    updateInstallationManualPrice(requestId, netPrice, isOwner) {
      return persistInstallationManualPrice(db, requestId, netPrice, isOwner);
    },
    linkRequestQuote(requestId, quoteSnapshotId) {
      return persistCommercialRequestQuoteLink(db, requestId, quoteSnapshotId);
    },
    createPerson(displayName, options) {
      return persistCreatedPerson(db, displayName, options);
    },
    renamePerson(personId, displayName) {
      return persistRenamedPerson(db, personId, displayName);
    },
    retirePerson(personId) {
      return persistRetiredPerson(db, personId, new Date().toISOString());
    },
    createCustomer(displayName, profile) {
      return persistCreatedCustomer(db, displayName, profile);
    },
    updateCustomer(customerId, patch) {
      return persistUpdatedCustomer(db, customerId, patch);
    },
    renameCustomer(customerId, displayName) {
      return persistRenamedCustomer(db, customerId, displayName);
    },
    retireCustomer(customerId) {
      return persistRetiredCustomer(db, customerId, new Date().toISOString());
    },
    completeExecutionTask(taskId, input, actorPersonId = null) {
      return persistTaskComplete(
        db,
        taskId,
        new Date().toISOString(),
        input,
        actorPersonId,
      );
    },
    readInventory() {
      return readInventoryProjection(db);
    },
    readInventoryItem(resourceId) {
      return readInventoryItem(db, resourceId);
    },
    recordInventoryAdjustment(resourceId, quantityDelta, note) {
      return persistInventoryAdjustment(
        db,
        resourceId,
        quantityDelta,
        new Date().toISOString(),
        note,
      );
    },
    listActiveCostEvidence() {
      return resourcesReuse.evidence();
    },
    resourcesAdministration() {
      return resourcesReuse.admin();
    },
    supersedeCostEvidence(evidenceRowId, amount, note, extras) {
      const result = persistSupersededCostEvidence(
        db,
        evidenceRowId,
        amount,
        note,
        extras,
      );
      if (result.ok) {
        resourcesReuse.applySuccessfulWrite(result.evidence, evidenceRowId);
      }
      return result;
    },
    createInitialCostEvidence(input) {
      const result = persistInitialCostEvidence(db, input);
      if (result.ok) {
        resourcesReuse.applySuccessfulWrite(result.evidence);
      }
      return result;
    },
    close() {
      db.close();
    },
    assertBoundPlaneIdentity(expected) {
      assertPlaneIdentity(readOperationalPlaneIdentity(db), expected);
    },
  };
}

function requestOverviewItems(db: SqliteDatabase) {
  return listCommercialRequests(db).map((request) =>
    projectRequestOverviewItem({
      request,
      customerDisplayName: getCustomer(db, request.customerId)?.displayName ?? null,
      quotes: linkedQuoteOverviewItems(db, request.requestId),
    }),
  );
}

function quoteOverviewItems(db: SqliteDatabase) {
  return listQuoteSnapshots(db).map((quote) => {
    const requestLink = getCommercialRequestQuoteLinkByQuote(db, quote.quoteSnapshotId);
    return projectQuoteOverviewItem({
      quote,
      acceptance: getQuoteAcceptanceBySnapshotId(db, quote.quoteSnapshotId),
      order: getOrderSnapshotByQuoteSnapshotId(db, quote.quoteSnapshotId),
      requestId: requestLink?.requestId ?? null,
      requestReference: requestLink
        ? commercialRequestReference(requestLink.requestId)
        : null,
    });
  });
}

function jobOverviewItems(
  db: SqliteDatabase,
  providerRegistry: WorkcenterRegistry,
  eligibility: PeopleEligibilityContext | null,
) {
  const people = listPeople(db);
  return listOrderSnapshots(db).map((order) => {
    const release = getAcceptedProductionSnapshotByOrder(db, order.orderSnapshotId);
    const record = release
      ? getExecutionPlanBySnapshotId(db, release.snapshotId)
      : null;
    return projectJobOverviewItem({
      order,
      release,
      planView: record
        ? projectExecutionPlanView(
            record,
            people,
            release,
            eligibility,
            null,
            providerRegistry,
          )
        : null,
    });
  });
}

function assertExistingPlaneIdentity(
  db: SqliteDatabase,
  expected: { planeId: string; organizationId: string },
) {
  const current = readOperationalPlaneIdentity(db);
  assertPlaneIdentity(current, expected);
  return current;
}

function linkedQuoteOverviewItems(db: SqliteDatabase, requestId: string) {
  return listCommercialRequestQuoteLinks(db, requestId).flatMap((link) => {
    const quote = getQuoteSnapshot(db, link.quoteSnapshotId);
    if (!quote) {
      return [];
    }
    return [
      projectQuoteOverviewItem({
        quote,
        acceptance: getQuoteAcceptanceBySnapshotId(db, quote.quoteSnapshotId),
        order: getOrderSnapshotByQuoteSnapshotId(db, quote.quoteSnapshotId),
        requestId,
        requestReference: commercialRequestReference(requestId),
      }),
    ];
  });
}

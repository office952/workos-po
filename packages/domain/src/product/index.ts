export {
  ACM_CASSETTE_PANELS_CATEGORY_ID,
  FULL_ALUMINIUM_VOLUMETRIC_LETTERS_CATEGORY_ID,
  FRONT_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID,
  HALO_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID,
  LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID,
  SIGN_PANELS_FAMILY_ID,
  buildCatalogTree,
  categoryHasCycle,
  getProductCategory,
  getProductFamily,
  isLeafCategory,
  productCategories,
  productFamilies,
} from "./catalog.js";
export { projectProductCatalog } from "./catalogProjection.js";
export {
  DISPLAY_LABEL_MAX_LENGTH,
  PRODUCT_SYSTEM_ENTITY_KINDS,
  createDisplayLabelCatalog,
  displayLabelKey,
  isKnownProductSystemEntity,
  isProductSystemEntityKind,
  presentedTemplate,
  seedDisplayLabelRecords,
  seededDisplayLabelCatalog,
  validateDisplayLabel,
  type DisplayLabelCatalog,
  type DisplayLabelRecord,
  type ProductSystemEntityKind,
} from "./displayMetadata.js";
export { presentProductSystem } from "./productSystemPresentation.js";
export {
  compileAcceptedProductEvaluation,
  type AcceptedProductEvaluation,
} from "./acceptedEvaluation.js";
export {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
  definitionReviewId,
  isFieldVisible,
  selectedComponentIds,
  type CompileAggregateOptions,
} from "./compiler.js";
export {
  CONFIGURATION_REVIEW_ID_PREFIX,
  configurationReviewId,
  configurationReviewIdFor,
  confirmReviewedDraft,
  projectConfigurationPreview,
  usedTechnicalSettingsSnapshot,
  visibleFormSchema,
  type ConfigurationPreview,
  type ConfigurationProductIdentity,
  type ConfigurationSelectedComponent,
  type TechnicalSettingSnapshot,
} from "./configurationPreview.js";
export {
  noteCompileEic,
  noteEvaluateProductComponents,
  noteListActiveCostEvidence,
  noteRuntimeLabels,
  noteRuntimePresent,
  runWithProductEvaluationTrace,
  runWithProductEvaluationTraceAsync,
  type ProductEvaluationTrace,
} from "./evaluationTrace.js";
export {
  collectComponentMeasurements,
  evaluateProductComponents,
  lightingEvaluationFrom,
} from "./componentEvaluation.js";
export type { ComponentEvaluation } from "./componentEvaluation.js";
export {
  COMPONENT_TYPE_IDS,
  getComponentContract,
  listComponentContracts,
} from "./componentRegistry.js";
export {
  ATTRIBUTE_OWNERSHIPS,
  attributeKindLabel,
  attributeOwnershipLabel,
  componentTypes,
  getComponentType,
  listComponentTypesForRole,
  liveResourceIdsForType,
  resolveTypeResources,
} from "./componentTypes.js";
export {
  COMPONENT_ROLES,
  projectComponentArchitecture,
} from "./componentProjection.js";
export {
  adminEditClassLabel,
  adminLifecycleLabel,
  collectChildCategoryIds,
  computeCategoryDepth,
  projectProductSystemAdministration,
} from "./productSystemAdmin.js";
export { BACK_COMPONENT_ID, forexBackContract } from "./back.js";
export {
  FACE_AREA_FIELD,
  FACE_COMPONENT_ID,
  FACE_MISSING_AREA,
  faceAreaSquareMeters,
  plexiglasFaceContract,
} from "./face.js";
export {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
export {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_GOLDEN_DEPTH_MM,
  ACM_GOLDEN_HEIGHT_MM,
  ACM_GOLDEN_WIDTH_MM,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "./acmCassetteNone.js";
export {
  formSchemas,
  getFormSchema,
  getFormSchemaForTemplate,
  getProductTemplate,
  productTemplates,
} from "./productRegistry.js";
export {
  ACM_FRAME_CLEARANCE_MM,
  ACM_UNFOLD_RETURN_SIDES,
  cassetteBlankMm,
  frameExternalSizeMm,
  rectanglePerimeterMm,
} from "./acmGeometry.js";
export {
  ACM_CASSETTE_BODY_TYPE_ID,
  FACE_CASSETTE_DEPTH_FIELD,
  FACE_HEIGHT_FIELD,
  FACE_THICKNESS_FIELD,
  FACE_WIDTH_FIELD,
  acmCassetteBodyContract,
} from "./acmCassetteBody.js";
export {
  FRAME_MISSING_PANEL_GEOMETRY,
  STEEL_INTERNAL_FRAME_TYPE_ID,
  steelInternalFrameContract,
} from "./steelInternalFrame.js";
export {
  LIGHTING_COMPONENT_ID,
  LIGHTING_MISSING_LED_GEOMETRY,
  LIGHTING_MISSING_LED_LOAD,
  LIGHTING_MISSING_PSU_CAPACITY,
  LIGHTING_MISSING_PSU_SELECTION,
  ledModuleQuantityFromPerimeter,
  lightingFrontLedContract,
  requiredPsuCapacityW,
} from "./lighting.js";
export { selectPsuUnits } from "./psuSelection.js";
export {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
  applyResolvedTechnicalSettingValue,
  componentTechnicalSettingsRegistry,
  createTechnicalSettingsRegistry,
  findTechnicalSettingDefinition,
  findTechnicalSettingDefinitionBySettingId,
  lightingFrontLedTechnicalSettings,
  listTypeTechnicalSettings,
  projectTechnicalSettings,
  requiredTechnicalSettingDefinitions,
  resolvedSettingValue,
  technicalSettingDefinitionId,
  validateTechnicalSettingValue,
} from "./technicalSettings.js";
export {
  SUPPORTED_TECHNICAL_SETTING_IDS,
  TECHNICAL_SETTING_ACTOR_KINDS,
  TECHNICAL_SETTING_SCOPE,
  TECHNICAL_SETTING_STARTER_SYSTEM_ID,
  TECHNICAL_SETTING_VERSION_SOURCES,
  TECHNICAL_SETTING_VERSION_STATUSES,
  actorFieldsFrom,
  actorIsValid,
  createPlatformStarterTechnicalSettingVersions,
  isSupportedTechnicalSettingId,
  isTechnicalSettingActorKind,
  isTechnicalSettingVersionRecord,
  isTechnicalSettingVersionSource,
  isTechnicalSettingVersionStatus,
  planTechnicalSettingsSave,
  technicalSettingSourceLabel,
  technicalSettingStatusLabel,
} from "./technicalSettingVersion.js";
export {
  TECHNICAL_SETTINGS_EMPTY_REASON,
  TECHNICAL_SETTINGS_INACTIVE,
  TECHNICAL_SETTINGS_INACTIVE_REASON,
  TECHNICAL_SETTINGS_INVALID,
  TECHNICAL_SETTINGS_INVALID_REASON,
  resolveOrganizationTechnicalSettings,
  technicalSettingsForTypeFromResolved,
  technicalSettingsLookupFromResolved,
} from "./resolveTechnicalSettings.js";
export {
  VOLUME_COMPONENT_ID,
  VOLUME_MISSING_PERIMETER,
  VOLUME_PERIMETER_FIELD,
  aluminiumVolumeContract,
  volumeLinearMeters,
} from "./volume.js";
export type {
  ComponentCalculationContract,
  ComponentCalculationInput,
  ComponentCalculationResult,
  ComponentContractProfile,
  ComponentInspectionLine,
  SharedCalculationContext,
} from "./componentContract.js";
export type {
  ComponentConfigurationAttribute,
  ComponentProductConfiguration,
  ComponentRoleProjection,
  ComponentTypeProjection,
} from "./componentProjection.js";
export type {
  AttributeOwnership,
  ComponentAttributeDefinition,
  ComponentAttributeKind,
  ComponentTypeDefinition,
  ResourceResolution,
} from "./componentTypes.js";
export type {
  ComponentTechnicalSettingDefinition,
  ComponentTechnicalSettingProjection,
  TechnicalSettingIssue,
  TechnicalSettingsRegistry,
} from "./technicalSettings.js";
export type {
  SupportedTechnicalSettingId,
  TechnicalSettingActor,
  TechnicalSettingActorKind,
  TechnicalSettingDraftValue,
  TechnicalSettingSavePlan,
  TechnicalSettingVersionRecord,
  TechnicalSettingVersionSource,
  TechnicalSettingVersionStatus,
} from "./technicalSettingVersion.js";
export type {
  ResolvedTechnicalSetting,
  TechnicalSettingResolution,
} from "./resolveTechnicalSettings.js";
export type {
  AdminCategoryRecord,
  AdminEditClass,
  AdminFamilyRecord,
  AdminLifecycleState,
  AdminProductRecord,
  AdminReadiness,
  AdminTypeRecord,
  ProductSystemAdminProjection,
} from "./productSystemAdmin.js";
export type {
  CatalogTreeNode,
  ComponentCalculationStatus,
  ComponentInputMapping,
  ComponentRole,
  ComponentTypeId,
  ComponentRuntimeStatus,
  ComponentSummary,
  DraftConfiguration,
  DraftValue,
  DraftValues,
  FieldOption,
  FieldType,
  FormField,
  FormSchema,
  FormSection,
  MissingInput,
  ProductAggregate,
  ProductCategory,
  ProductComponent,
  ProductDefinition,
  ProductFamily,
  ProductIdentityFact,
  ProductTemplate,
  ProductTruth,
  TechnicalMeasurement,
  TechnicalQuantity,
  VisibilityRule,
} from "./types.js";

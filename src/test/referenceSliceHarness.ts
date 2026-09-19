import { presentCustomerId } from "../adapters/contextAdapter";
import { presentCostEvidenceMutation } from "../adapters/resourcesAdapter";
import { createCustomer } from "../api/customers";
import { patchCostEvidence } from "../api/resources";
import type { DraftValues } from "../api/types";
import { LETTERS_PRODUCT_CODE } from "../reference/lettersProduct";

export const HARNESS_PRODUCT_CODE = LETTERS_PRODUCT_CODE;

export const HARNESS_CUSTOMER_DISPLAY_NAME = "Client sintetic Reference Slice V1";

export const HARNESS_INSCRIPTION = "synthetic reference text";

export const HARNESS_CONFIGURATION_VALUES: DraftValues = {
  "root.inscription": HARNESS_INSCRIPTION,
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

export const HARNESS_FIELD_DRAFTS: Record<string, string> = {
  "root.inscription": HARNESS_INSCRIPTION,
  "face.finish": "none",
  "face.confirmedAreaMm2": "250000",
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": "12500",
};

export async function createHarnessCustomer(): Promise<string | null> {
  return presentCustomerId(await createCustomer(HARNESS_CUSTOMER_DISPLAY_NAME));
}

export async function writeHarnessCostEvidence(
  evidenceRowId: string,
  amount: number,
): Promise<string | null> {
  const result = await patchCostEvidence(evidenceRowId, { amount });
  if (!result.ok) {
    return null;
  }
  return presentCostEvidenceMutation(result.body)?.evidenceRowId ?? null;
}

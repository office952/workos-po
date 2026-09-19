export const HEALTH_SERVICE_NAME = "workos-final-api" as const;
export const API_CONTRACT_ID = "workos-ui-contract-v1" as const;

export type HealthResponse = {
  status: "ok";
  service: typeof HEALTH_SERVICE_NAME;
  apiContractId: typeof API_CONTRACT_ID;
};

import type { Hono } from "hono";
import type { ApiEnv } from "../cloud/context.js";
import { registerCustomerCommercialTermsRoutes } from "./commercialTerms.js";
import { registerCustomerDocumentRoutes } from "./documents.js";
import { registerHistoricalWorkRoutes } from "./historicalWorks.js";
import { registerCustomerHistoryRoutes } from "./history.js";
import { registerWorkRepresentativePhotoRoutes } from "./representativePhotos.js";
import { registerCustomerSiteRoutes } from "./sites.js";

/** N-020 · the customer dossier. Registered before the generic `/api/customers/:customerId` routes. */
export function registerCustomerDossierRoutes(app: Hono<ApiEnv>): void {
  registerCustomerSiteRoutes(app);
  registerCustomerDocumentRoutes(app);
  registerCustomerCommercialTermsRoutes(app);
  registerHistoricalWorkRoutes(app);
  registerCustomerHistoryRoutes(app);
  registerWorkRepresentativePhotoRoutes(app);
}

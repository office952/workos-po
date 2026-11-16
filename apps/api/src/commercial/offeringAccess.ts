import {
  commercialOfferingView,
  evaluateOfferingPolicy,
  offeringPolicyModeLabel,
  resolveOfferingPriceRight,
  type OfferingActor,
  type OfferingEvaluation,
  type OfferingPolicy,
  type OfferingPriceRight,
} from "@workos-final/domain";
import { can, organizationRole, type ApiContext } from "../cloud/context.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";

/**
 * Commercial & Financial V1 · server-side resolution of the effective pricing right.
 * The fixed role decides who *may* use the policy; the organization policy decides whether the
 * Comercial role actually sets the price. The right to set a price never grants internal cost.
 */
export function offeringActor(c: ApiContext): OfferingActor {
  return {
    canSetPriceByRole: can(c, "prices.manual.set"),
    mayUseOfferingPolicy: can(c, "offering.policy.use"),
  };
}

export function effectiveOfferingPriceRight(
  c: ApiContext,
  runtime: ProductSystemRuntime,
): { policy: OfferingPolicy; right: OfferingPriceRight } {
  const policy = runtime.readOfferingPolicy();
  return { policy, right: resolveOfferingPriceRight(policy, offeringActor(c)) };
}

export function actorIdentity(c: ApiContext): { userId: string; label: string; role: "owner" | "member" } {
  const user = c.get("cloudUser");
  const role = organizationRole(c) === "owner" ? "owner" : "member";
  return {
    userId: user?.userId ?? "local",
    label: user?.email ?? "Proprietar local",
    role,
  };
}

export function evaluateOfferingForActor(
  c: ApiContext,
  policy: OfferingPolicy,
  input: { netPrice: number; internalCost: number | null; internalCostComplete: boolean },
): OfferingEvaluation {
  return evaluateOfferingPolicy({ policy, actor: offeringActor(c), ...input });
}

/** Presentation of the policy that the Comercial role may see (no thresholds). */
export function presentPolicyForCommercial(policy: OfferingPolicy, right: OfferingPriceRight) {
  return {
    mode: policy.mode,
    modeLabel: offeringPolicyModeLabel(policy.mode),
    version: policy.version,
    canSetPrice: right.canSetPrice,
    blockedReason: right.blockedReason,
  };
}

export { commercialOfferingView };

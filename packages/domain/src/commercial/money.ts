import { COMMERCIAL_ROUNDING, type CommercialPolicy } from "./policy.js";
import { roundMoney } from "./price.js";

export function projectNetVatGross(
  netInput: number,
  policy: Pick<CommercialPolicy, "vatPercent" | "rounding">,
): { netPrice: number; vatAmount: number; grossPrice: number } {
  const rounding = policy.rounding ?? COMMERCIAL_ROUNDING;
  const netPrice = roundMoney(netInput, rounding);
  const vatAmount = roundMoney(netPrice * (policy.vatPercent / 100), rounding);
  const grossPrice = roundMoney(netPrice + vatAmount, rounding);
  return { netPrice, vatAmount, grossPrice };
}

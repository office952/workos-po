import {
  OFFERING_POLICY_MODES,
  approvalViewFor,
  offeringPolicyModeLabel,
  offeringRuleLabel,
  priceApprovalStatusLabel,
  readApprovalReason,
  validateOfferingPolicyInput,
  type OfferingPolicy,
  type PriceApprovalRecord,
  type PriceApprovalStatus,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireCapability } from "../cloud/middleware.js";
import { actorIdentity, effectiveOfferingPriceRight, presentPolicyForCommercial } from "./offeringAccess.js";

function presentOwnerPolicy(policy: OfferingPolicy) {
  return {
    mode: policy.mode,
    modeLabel: offeringPolicyModeLabel(policy.mode),
    rules: policy.rules,
    version: policy.version,
    source: policy.source,
    createdAt: policy.createdAt,
    createdByLabel: policy.createdByLabel,
  };
}

function presentOwnerApproval(
  approval: PriceApprovalRecord,
  request: { reference: string | null; customerLabel: string | null } | null,
) {
  return {
    approvalId: approval.approvalId,
    requestId: approval.subject.requestId,
    productCode: approval.subject.productCode,
    requestReference: request?.reference ?? null,
    customerLabel: request?.customerLabel ?? null,
    status: approval.status,
    statusLabel: priceApprovalStatusLabel(approval.status),
    netPrice: approval.netPrice,
    installationNetPrice: approval.installationNetPrice,
    currency: approval.currency,
    internalCostComplete: approval.internalCostComplete,
    triggeredRules: approval.triggeredRules.map((rule) => ({ id: rule, label: offeringRuleLabel(rule) })),
    policyVersion: approval.policyVersion,
    policyModeLabel: offeringPolicyModeLabel(approval.policyMode),
    requestedByLabel: approval.requestedByLabel,
    requestedAt: approval.requestedAt,
    requestNote: approval.requestNote,
    decidedByLabel: approval.decidedByLabel,
    decidedAt: approval.decidedAt,
    decisionReason: approval.decisionReason,
  };
}

const APPROVAL_STATUS_FILTERS: readonly PriceApprovalStatus[] = ["REQUESTED", "APPROVED", "REJECTED", "WITHDRAWN"];

export function registerOfferingRoutes(app: Hono<ApiEnv>): void {
  // The organization's own view of its policy, for any role that may use it (no thresholds).
  app.get("/api/offering-policy", requireCapability("prices.client.read"), (c) => {
    const runtime = getProductSystem(c);
    const { policy, right } = effectiveOfferingPriceRight(c, runtime);
    return c.json({ policy: presentPolicyForCommercial(policy, right) });
  });

  app.get("/api/admin/offering-policy", requireCapability("org.settings.manage"), (c) => {
    const runtime = getProductSystem(c);
    return c.json({
      policy: presentOwnerPolicy(runtime.readOfferingPolicy()),
      versions: runtime.listOfferingPolicyVersions().map(presentOwnerPolicy),
      modes: OFFERING_POLICY_MODES.map((mode) => ({ mode, label: offeringPolicyModeLabel(mode) })),
      openApprovals: runtime.listPriceApprovals({ status: "REQUESTED" }).length,
    });
  });

  app.post("/api/admin/offering-policy", requireCapability("org.settings.manage"), async (c) => {
    const runtime = getProductSystem(c);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || typeof body.expectedVersion !== "number") {
      return c.json({ error: "invalid_payload", reasons: ["Versiunea curentă a regulilor lipsește."] }, 400);
    }
    const validated = validateOfferingPolicyInput({
      mode: body.mode,
      rules: (body.rules ?? null) as Parameters<typeof validateOfferingPolicyInput>[0]["rules"],
    });
    if (!validated.ok) {
      return c.json(
        { error: "invalid_policy", issues: validated.issues, reasons: validated.issues.map((issue) => issue.reason) },
        400,
      );
    }
    const actor = actorIdentity(c);
    const saved = runtime.saveOfferingPolicy(
      { mode: validated.mode, rules: validated.rules },
      { userId: actor.userId, label: actor.label },
      body.expectedVersion,
    );
    if (!saved.ok) {
      return c.json(
        {
          error: saved.error,
          currentVersion: saved.currentVersion,
          reasons: ["Regulile au fost modificate între timp. Reîncarcă pagina și verifică versiunea curentă."],
        },
        409,
      );
    }
    return c.json({ alreadyApplied: saved.alreadyApplied, policy: presentOwnerPolicy(saved.policy) });
  });

  app.get("/api/admin/price-approvals", requireCapability("quotes.price_exception.approve"), (c) => {
    const runtime = getProductSystem(c);
    const statusParam = c.req.query("status");
    const status = APPROVAL_STATUS_FILTERS.find((item) => item === statusParam);
    const approvals = runtime.listPriceApprovals(status ? { status } : {});
    return c.json({
      approvals: approvals.map((approval) => {
        const request = runtime.readCommercialRequest(approval.subject.requestId);
        const customer = request?.customerId ? runtime.getCustomer(request.customerId) : null;
        return presentOwnerApproval(approval, {
          reference: request ? (request as { reference?: string }).reference ?? null : null,
          customerLabel: customer?.displayName ?? null,
        });
      }),
    });
  });

  app.get("/api/admin/price-approvals/:approvalId", requireCapability("quotes.price_exception.approve"), (c) => {
    const runtime = getProductSystem(c);
    const approval = runtime.readPriceApproval(c.req.param("approvalId"));
    if (!approval) return c.json({ error: "not_found" }, 404);
    return c.json({
      approval: presentOwnerApproval(approval, null),
      events: runtime.listPriceApprovalEvents(approval.approvalId).map((event) => ({
        sequence: event.sequence,
        kind: event.kind,
        kindLabel: priceApprovalStatusLabel(event.kind),
        actorLabel: event.actorLabel,
        occurredAt: event.occurredAt,
        reason: event.reason,
      })),
    });
  });

  app.post(
    "/api/admin/price-approvals/:approvalId/decision",
    requireCapability("quotes.price_exception.approve"),
    async (c) => {
      const runtime = getProductSystem(c);
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      const decision = body?.decision;
      if (decision !== "APPROVED" && decision !== "REJECTED") {
        return c.json({ error: "invalid_payload", reasons: ["Alege aprobarea sau respingerea."] }, 400);
      }
      const reason = readApprovalReason(body?.reason, decision === "REJECTED");
      if (reason === false) {
        return c.json(
          { error: "invalid_reason", reasons: ["Motivul respingerii este obligatoriu (maximum 500 de caractere)."] },
          400,
        );
      }
      const actor = actorIdentity(c);
      const decided = runtime.decidePriceApproval(c.req.param("approvalId"), decision, reason, {
        userId: actor.userId,
        label: actor.label,
      });
      if (!decided.ok) {
        return decided.error === "not_found"
          ? c.json({ error: "not_found" }, 404)
          : c.json({ error: decided.error, reasons: ["Solicitarea nu mai este deschisă."] }, 409);
      }
      return c.json({
        approval: presentOwnerApproval(decided.approval, null),
        view: approvalViewFor(decided.approval, decided.approval.bindingHash),
      });
    },
  );
}

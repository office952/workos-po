import { useState, type ReactNode } from "react";
import {
  CONTROL_TOTAL_MODE,
  presentOfferingAdmin,
  presentPriceApprovals,
  type OfferingAdminModel,
  type OfferingRules,
  type PriceApprovalItem,
} from "../adapters/commercialFinancialAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import {
  AdminBullets,
  AdminChangeBar,
  AdminColumns,
  AdminContextBlock,
  AdminField,
  AdminPolicyOptions,
  AdminReviewDialog,
  AdminSection,
  AdminVersionList,
} from "../admin/adminParts";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import { useAdminLeaveGuard } from "../admin/useAdminLeaveGuard";
import { fetchOfferingPolicyAdmin, fetchPriceApprovals, saveOfferingPolicy } from "../api/commercialFinancial";
import { TransportError } from "../api/http";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StateNotice } from "../components/StateNotice";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { formatMoney, formatTimestamp } from "../presentation/format";
import { configuratorVariantHref, requestHref } from "../routing/appRoute";
import "../styles/surfaces/commercial-financial.css";

type Draft = { mode: string; incomplete: boolean; margin: string; maxValue: string };

const MODE_DESCRIPTIONS: Record<string, string> = {
  OWNER_ONLY:
    "Potrivit pentru o firmă mică: Proprietarul stabilește prețul și îngheață fiecare ofertă. Comercialul pregătește cererea și configurația.",
  COMMERCIAL_AUTONOMOUS:
    "Comercialul stabilește prețul net și îngheață oferta. Nu vede costul intern și nu acceptă comanda.",
  COMMERCIAL_APPROVAL_POLICY:
    "Comercialul îngheață ofertele care respectă regulile de mai jos. Celelalte îți sunt trimise spre aprobare.",
  [CONTROL_TOTAL_MODE]:
    "Comercialul configurează și propune prețul. Fiecare ofertă a lui îți este trimisă spre aprobare, indiferent de sumă sau marjă.",
};

const SAVE_EFFECTS = [
  "Salvarea creează o versiune nouă a regulilor de ofertare.",
  "Ofertele deja înghețate rămân neschimbate; fiecare păstrează versiunea după care a fost emisă.",
  "O aprobare acordată pe o versiune anterioară nu mai acoperă oferte noi.",
  "Comercialul vede doar rezultatul („respectă regulile” / „necesită aprobare”), nu pragurile.",
] as const;

function draftOf(model: OfferingAdminModel): Draft {
  return {
    mode: model.policy.mode,
    incomplete: model.policy.rules.incompleteCostRequiresApproval,
    margin: model.policy.rules.minimumMarginPercent === null ? "" : String(model.policy.rules.minimumMarginPercent),
    maxValue: model.policy.rules.maximumNetValue === null ? "" : String(model.policy.rules.maximumNetValue),
  };
}

function parseOptional(value: string): number | null | "invalid" {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.mode === b.mode && a.incomplete === b.incomplete && a.margin.trim() === b.margin.trim() && a.maxValue.trim() === b.maxValue.trim();
}

function rulesSummary(rules: OfferingRules, currency = "EUR"): string {
  const parts: string[] = [];
  if (rules.incompleteCostRequiresApproval) parts.push("cost intern incomplet");
  if (rules.minimumMarginPercent !== null) parts.push(`marjă sub ${rules.minimumMarginPercent}%`);
  if (rules.maximumNetValue !== null) parts.push(`valoare netă peste ${formatMoney(rules.maximumNetValue, currency)}`);
  return parts.length > 0 ? `Aprobare la: ${parts.join(", ")}` : "Fără reguli active";
}

export function OfferingPolicyAdminPage() {
  const admin = useResource(resourceKeys.offeringAdmin(), async () => presentOfferingAdmin(await fetchOfferingPolicyAdmin()));
  const approvals = useResource(resourceKeys.priceApprovals(), async () =>
    presentPriceApprovals(await fetchPriceApprovals()),
  );
  const [source, setSource] = useState<unknown>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const model = admin.data ?? null;
  const forbidden = admin.error instanceof TransportError && admin.error.status === 403;
  const loadState = model ? "ready" : admin.status === "error" ? (forbidden ? "forbidden" : "error") : "loading";
  const base = model ? draftOf(model) : null;
  const dirty = Boolean(base && draft && !sameDraft(base, draft));

  if (model && model !== source) {
    setSource(model);
    if (!dirty) setDraft(draftOf(model));
  }

  function discard(): void {
    if (model) setDraft(draftOf(model));
    setReviewing(false);
    setSaveState("idle");
    setErrorMessage(null);
  }

  const margin = draft ? parseOptional(draft.margin) : null;
  const maxValue = draft ? parseOptional(draft.maxValue) : null;
  const approvalMode = draft?.mode === "COMMERCIAL_APPROVAL_POLICY";
  const noRule = approvalMode && draft && !draft.incomplete && margin === null && maxValue === null;
  const invalid = margin === "invalid" || maxValue === "invalid";

  async function save(): Promise<void> {
    if (!draft || !model || invalid) return;
    setSaveState("pending");
    setErrorMessage(null);
    const controlTotal = draft.mode === CONTROL_TOTAL_MODE;
    const result = await saveOfferingPolicy({
      // Control total is saved as the approval mode with its unconditional rule.
      mode: controlTotal ? "COMMERCIAL_APPROVAL_POLICY" : draft.mode,
      rules: {
        incompleteCostRequiresApproval: approvalMode ? draft.incomplete : false,
        minimumMarginPercent: approvalMode ? (margin as number | null) : null,
        maximumNetValue: approvalMode ? (maxValue as number | null) : null,
        ...(controlTotal ? { everyOfferRequiresApproval: true } : {}),
      },
      expectedVersion: model.policy.version,
    });
    if (result.ok) {
      invalidateResources(resourceKeys.offeringAdmin(), resourceKeys.offeringPolicy());
      setSaveState("success");
      setReviewing(false);
      return;
    }
    setSaveState("error");
    setErrorMessage(
      result.status === 409
        ? "Regulile au fost modificate între timp de altcineva. Reîncarcă pagina și verifică versiunea curentă."
        : adminFailureContent(
            describeAdminFailure(result.status, result.body, { forbidden: "Doar Proprietarul poate modifica regulile de ofertare." }, "Regulile nu au putut fi salvate."),
          ),
    );
  }

  const guard = useAdminLeaveGuard({
    dirty,
    subject: "Regulile de ofertare",
    requestSave: () => setReviewing(true),
    saveFlowOpen: reviewing || saveState === "pending",
    onDiscard: discard,
  });
  const pending = saveState === "pending";
  const nextVersion = (model?.policy.version ?? 0) + 1;
  const modeLabel = (mode: string) => model?.modes.find((item) => item.mode === mode)?.label ?? mode;

  return (
    <AdminLayout
      current="offering"
      title="Reguli de ofertare"
      lead="Cine stabilește prețul clientului și îngheață oferta, și când este nevoie de aprobarea ta. Costul intern și pragurile rămân vizibile doar pentru tine."
      meta={
        model ? (
          <span>
            {model.policy.source === "PLATFORM_DEFAULT"
              ? "Comportament implicit (nicio versiune salvată)"
              : `Versiunea ${model.policy.version} activă · ${formatTimestamp(model.policy.createdAt) ?? ""}`}
          </span>
        ) : undefined
      }
      changeBar={
        dirty && draft ? (
          <AdminChangeBar
            title="Regulile de ofertare au modificări nesalvate"
            detail={`${modeLabel(base?.mode ?? "")} → ${modeLabel(draft.mode)}`}
            pending={pending}
            saveDisabled={invalid || Boolean(noRule)}
            onDiscard={discard}
            onSave={() => setReviewing(true)}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă regulile de ofertare" /> : null}
      {loadState === "forbidden" ? (
        <StateNotice
          kind="read-only"
          title="Acces doar pentru Proprietar"
          reason="Regulile de ofertare și pragurile de aprobare sunt stabilite de Proprietarul organizației. În configurator vezi dacă poți stabili prețul și dacă oferta necesită aprobare."
        />
      ) : null}
      {loadState === "error" ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          Regulile de ofertare nu sunt disponibile.
        </InlineAlert>
      ) : null}
      {model && draft ? (
        <AdminColumns
          main={
            <>
              {saveState === "success" && !dirty ? (
                <InlineAlert tone="success" title="Regulile au fost salvate">
                  Versiunea {model.policy.version} este activă. Ofertele înghețate rămân neschimbate.
                </InlineAlert>
              ) : null}
              {saveState === "error" && errorMessage && !reviewing ? (
                <InlineAlert tone="error" title="Salvarea a eșuat">
                  {errorMessage} Modificările tale sunt păstrate.
                </InlineAlert>
              ) : null}
              <PriceApprovalsSection
                approvals={approvals.data ?? []}
                loading={approvals.status === "loading" && !approvals.data}
              />
              <AdminSection title="Cine stabilește prețul și îngheață oferta">
                <AdminPolicyOptions
                  name="offering-mode"
                  legend="Modul de ofertare"
                  value={draft.mode}
                  activeValue={model.policy.mode}
                  disabled={pending}
                  options={model.modes.map((item) => ({
                    value: item.mode,
                    label: item.label,
                    description: MODE_DESCRIPTIONS[item.mode] ?? item.summary,
                  }))}
                  onChange={(mode) => setDraft({ ...draft, mode })}
                />
                {model.affectedVariants > 0 && draft.mode !== model.policy.mode ? (
                  <p className="ui-note" data-testid="offering-affected-variants">
                    {model.affectedVariants === 1
                      ? "O variantă de ofertă neemisă are o aprobare în curs sau acordată. După salvare, aprobarea trebuie cerută din nou."
                      : `${model.affectedVariants} variante de ofertă neemise au aprobări în curs sau acordate. După salvare, aprobările trebuie cerute din nou.`}
                  </p>
                ) : null}
              </AdminSection>
              {approvalMode ? (
                <AdminSection
                  title="Când este nevoie de aprobarea ta"
                  description="Activează cel puțin o regulă și introdu valoarea. Nu există valori propuse automat."
                >
                  <label className="adm-option" htmlFor="rule-incomplete">
                    <input
                      id="rule-incomplete"
                      type="checkbox"
                      checked={draft.incomplete}
                      disabled={pending}
                      onChange={(event) => setDraft({ ...draft, incomplete: event.target.checked })}
                    />
                    <span className="adm-option__copy">
                      <span className="adm-option__label">Costul intern al ofertei nu este complet</span>
                      <span className="adm-option__description">Oferta cere aprobare când lipsesc costuri sau tarife.</span>
                    </span>
                  </label>
                  <AdminField
                    id="rule-margin"
                    label="Marja minimă față de costul intern"
                    help="Lasă gol pentru a nu folosi regula. Dacă costul nu este complet, marja nu poate fi verificată și oferta cere aprobare."
                    unit="%"
                    inputMode="decimal"
                    value={draft.margin}
                    baseline={base?.margin}
                    disabled={pending}
                    error={margin === "invalid" ? "Trebuie să fie un număr." : null}
                    onChange={(value) => setDraft({ ...draft, margin: value })}
                  />
                  <AdminField
                    id="rule-max-value"
                    label="Valoare netă maximă fără aprobare"
                    help="Prețul net al ofertei (produs și montaj), fără TVA. Lasă gol pentru a nu folosi regula."
                    unit="EUR"
                    inputMode="decimal"
                    value={draft.maxValue}
                    baseline={base?.maxValue}
                    disabled={pending}
                    error={maxValue === "invalid" ? "Trebuie să fie un număr." : null}
                    onChange={(value) => setDraft({ ...draft, maxValue: value })}
                  />
                  {noRule ? (
                    <InlineAlert tone="blocked" title="Nicio regulă activă">
                      Modul cu aprobare are nevoie de cel puțin o regulă. Fără ea, Comercialul nu poate îngheța oferte.
                    </InlineAlert>
                  ) : null}
                </AdminSection>
              ) : null}
            </>
          }
          aside={
            <>
              <AdminContextBlock title={dirty ? "La salvare" : "Cum se aplică"}>
                <AdminBullets items={SAVE_EFFECTS} />
              </AdminContextBlock>
              <AdminVersionList
                rows={model.versions.map((row) => ({
                  key: String(row.version),
                  version: `v${row.version}`,
                  active: row.version === model.policy.version,
                  when: formatTimestamp(row.createdAt) ?? null,
                  detail: `${row.modeLabel}${row.mode === "COMMERCIAL_APPROVAL_POLICY" ? ` · ${rulesSummary(row.rules)}` : ""}${row.createdByLabel ? ` · ${row.createdByLabel}` : ""}`,
                }))}
                highlightActive={saveState === "success" && !dirty}
                emptyText="Nu există încă o versiune salvată. Se aplică „Doar Proprietarul”."
              />
            </>
          }
        />
      ) : null}
      {reviewing && model && draft ? (
        <AdminReviewDialog
          subtitle={`Reguli de ofertare · se va crea versiunea ${nextVersion}`}
          rows={[
            { label: "Mod", from: model.policy.modeLabel, to: modeLabel(draft.mode) },
            ...(approvalMode
              ? [
                  {
                    label: "Reguli",
                    from: rulesSummary(model.policy.rules),
                    to: rulesSummary({
                      incompleteCostRequiresApproval: draft.incomplete,
                      minimumMarginPercent: typeof margin === "number" ? margin : null,
                      maximumNetValue: typeof maxValue === "number" ? maxValue : null,
                    }),
                  },
                ]
              : []),
          ]}
          effects={SAVE_EFFECTS}
          confirmLabel={`Salvează versiunea ${nextVersion}`}
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => void save()}
          onCancel={() => setReviewing(false)}
        />
      ) : null}
      {guard}
    </AdminLayout>
  );
}

function PriceApprovalsSection({ approvals, loading }: { approvals: PriceApprovalItem[]; loading: boolean }) {
  const open = approvals.filter((item) => item.status === "REQUESTED");
  const decided = approvals.filter((item) => item.status === "APPROVED" || item.status === "REJECTED").slice(0, 10);
  return (
    <AdminSection
      title="Solicitări de aprobare"
      description="Ofertele pregătite de Comercial care depășesc regulile. Aprobarea acoperă doar varianta exactă de configurație și preț."
    >
      {loading ? <LoadingFloor variant="admin" label="Se încarcă solicitările" /> : null}
      {!loading && open.length === 0 ? <p className="adm-context__text">Nu există solicitări în așteptare.</p> : null}
      {open.length > 0 ? (
        <ul className="cfc-approvals" aria-label="Solicitări în așteptare">
          {open.map((item) => (
            <ApprovalRow key={item.approvalId} item={item} />
          ))}
        </ul>
      ) : null}
      {decided.length > 0 ? (
        <>
          <h3 className="adm-context__title">Decizii recente</h3>
          <ul className="cfc-approvals" aria-label="Decizii recente">
            {decided.map((item) => (
              <li key={item.approvalId} className="cfc-approval">
                <div className="cfc-approval__head">
                  <span>{item.customerLabel ?? "Client"} · {item.requestReference ?? "Cerere"}</span>
                  <span>{item.statusLabel}</span>
                </div>
                <p className="cfc-approval__meta">
                  {item.netPrice !== null ? `Preț net ${formatMoney(item.netPrice, item.currency)}` : ""}
                  {item.decidedByLabel ? ` · ${item.decidedByLabel}` : ""}
                  {item.decidedAt ? ` · ${formatTimestamp(item.decidedAt) ?? ""}` : ""}
                  {item.decisionReason ? ` · Motiv: ${item.decisionReason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </AdminSection>
  );
}

function ApprovalRow({ item }: { item: PriceApprovalItem }) {
  const total = (item.netPrice ?? 0) + (item.installationNetPrice ?? 0);
  const decideHref =
    item.requestId && item.variantId && item.productCode
      ? configuratorVariantHref({ customerId: null, requestId: item.requestId, productCode: item.productCode }, item.variantId, "pret")
      : item.requestId
        ? requestHref(item.requestId)
        : null;
  return (
    <li className="cfc-approval">
      <div className="cfc-approval__head">
        <span>
          {item.customerLabel ?? "Client"} ·{" "}
          {item.requestId ? <a className="text-link" href={requestHref(item.requestId)}>{item.requestReference ?? "Cerere"}</a> : "Cerere"}
        </span>
        <span>{item.netPrice !== null ? `Preț net ${formatMoney(total, item.currency)}` : ""}</span>
      </div>
      <p className="cfc-approval__rules">
        {item.triggeredRules.map((rule) => rule.label).join(" · ")}
        {item.internalCostComplete ? "" : " · Cost intern incomplet"}
      </p>
      <p className="cfc-approval__meta">
        Cerută de {item.requestedByLabel ?? "—"} · {formatTimestamp(item.requestedAt) ?? ""}
        {item.requestNote ? ` · Notă: ${item.requestNote}` : ""}
      </p>
      {decideHref ? (
        <p>
          <a className="text-link" href={decideHref}>
            Deschide varianta și decide acolo
          </a>
        </p>
      ) : null}
    </li>
  );
}

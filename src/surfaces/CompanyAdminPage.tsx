import { useState, type ReactNode } from "react";
import {
  presentCompanyIdentity,
  presentCompanyVersions,
  presentFieldIssues,
  type CompanyIdentityModel,
  type FieldIssue,
} from "../adapters/commercialFinancialAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import { changeCountLabel } from "../admin/adminText";
import {
  AdminBullets,
  AdminChangeBar,
  AdminColumns,
  AdminContextBlock,
  AdminField,
  AdminReviewDialog,
  AdminSection,
} from "../admin/adminParts";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import { useAdminLeaveGuard } from "../admin/useAdminLeaveGuard";
import { fetchCompanyIdentity, fetchCompanyIdentityVersions, saveCompanyIdentity } from "../api/commercialFinancial";
import { TransportError } from "../api/http";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StateNotice } from "../components/StateNotice";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { useResource } from "../data/useResource";
import { formatTimestamp } from "../presentation/format";
import "../styles/surfaces/commercial-financial.css";

/** Field help in operator language; the field list and labels come from the server. */
const FIELD_HELP: Record<string, string> = {
  legalName: "Obligatoriu. Apare pe oferte ca emitent.",
  brand: "Opțional. Apare pe ofertă doar dacă diferă de denumirea legală.",
  fiscalId:
    "Obligatoriu. Scrie CIF-ul românesc cu prefixul RO pentru a fi verificată cifra de control. Fără prefix, țara nu este cunoscută și se verifică doar formatul. Nicio verificare nu dovedește existența firmei.",
  tradeRegister: "Opțional. Apare pe ofertă dacă este completat.",
  address: "Opțional. Apare pe ofertă dacă este completat.",
  locality: "Opțional.",
  iban: "Opțional. Dacă este completat, se verifică formatul internațional (IBAN).",
  bank: "Opțional.",
};

const GROUPS: readonly { title: string; fields: readonly string[] }[] = [
  { title: "Identitate legală", fields: ["legalName", "brand"] },
  { title: "Identificare fiscală", fields: ["fiscalId", "tradeRegister"] },
  { title: "Adresă", fields: ["address", "locality"] },
  { title: "Date bancare pe documente", fields: ["iban", "bank"] },
];

const SAVE_EFFECTS = [
  "Salvarea creează o versiune nouă a datelor firmei, cu autorul și momentul modificării.",
  "Ofertele noi folosesc datele noi.",
  "Ofertele și comenzile deja înghețate păstrează datele firmei de la momentul emiterii.",
  "Câmpurile lăsate goale nu apar pe documente.",
] as const;

export function CompanyAdminPage() {
  const identity = useResource(resourceKeys.companyIdentity(), async () => presentCompanyIdentity(await fetchCompanyIdentity()));
  const model = identity.data ?? null;
  const versions = useResource(model?.canEdit ? resourceKeys.companyIdentityVersions() : null, async () =>
    presentCompanyVersions(await fetchCompanyIdentityVersions()),
  );
  const [source, setSource] = useState<unknown>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "success" | "error" | "conflict">("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [warnings, setWarnings] = useState<FieldIssue[]>([]);
  const forbidden = identity.error instanceof TransportError && identity.error.status === 403;
  const loadState = model ? "ready" : identity.status === "error" ? (forbidden ? "forbidden" : "error") : "loading";

  const changes = model && draft ? model.fields.filter(({ field }) => (draft[field] ?? "") !== (model.values[field] ?? "")) : [];
  const dirty = changes.length > 0;

  if (model && model !== source) {
    setSource(model);
    if (!dirty) setDraft({ ...model.values });
  }

  function discard(): void {
    if (model) setDraft({ ...model.values });
    setReviewing(false);
    setSaveState("idle");
    setErrorMessage(null);
    setIssues([]);
  }

  async function save(current: CompanyIdentityModel): Promise<void> {
    if (!draft) return;
    setSaveState("pending");
    setErrorMessage(null);
    setIssues([]);
    const result = await saveCompanyIdentity({ ...draft, expectedVersion: current.version });
    if (result.ok) {
      setWarnings(presentFieldIssues(result.body, "warnings"));
      invalidateResources(resourceKeys.companyIdentity(), resourceKeys.companyIdentityVersions(), resourceKeys.seller());
      setSaveState("success");
      setReviewing(false);
      return;
    }
    if (result.status === 409) {
      setSaveState("conflict");
      setReviewing(false);
      setErrorMessage(
        "Datele firmei au fost modificate între timp de altcineva. Reîncarcă datele curente; modificările tale sunt păstrate până atunci.",
      );
      return;
    }
    if (result.status === 400) {
      setIssues(presentFieldIssues(result.body, "issues"));
      setSaveState("error");
      setReviewing(false);
      setErrorMessage("Verifică valorile marcate.");
      return;
    }
    setSaveState("error");
    setErrorMessage(
      adminFailureContent(
        describeAdminFailure(result.status, result.body, { forbidden: "Doar Proprietarul poate modifica datele firmei." }, "Datele firmei nu au putut fi salvate."),
      ),
    );
  }

  const guard = useAdminLeaveGuard({
    dirty,
    subject: "Datele firmei",
    requestSave: () => setReviewing(true),
    saveFlowOpen: reviewing || saveState === "pending",
    onDiscard: discard,
  });
  const pending = saveState === "pending";
  const canEdit = Boolean(model?.canEdit);
  const labelOf = (field: string) => model?.fields.find((item) => item.field === field)?.label ?? field;

  return (
    <AdminLayout
      current="company"
      title="Date firmă"
      lead="Identitatea legală, fiscală și bancară care apare pe ofertele firmei. WorkOS nu emite facturi."
      meta={
        model ? (
          <>
            <span>{model.version > 0 ? `Versiunea ${model.version}` : model.configured ? "Fără istoric înregistrat" : "Neconfigurat"}</span>
            <span>{model.completenessLabel}</span>
          </>
        ) : undefined
      }
      changeBar={
        dirty && canEdit ? (
          <AdminChangeBar
            title={changeCountLabel(changes.length)}
            detail={changes.map(({ label }) => label).join(" · ")}
            pending={pending}
            onDiscard={discard}
            onSave={() => setReviewing(true)}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă datele firmei" /> : null}
      {loadState === "forbidden" ? (
        <StateNotice
          kind="read-only"
          title="Datele firmei nu sunt disponibile pentru acest rol"
          reason="Datele legale și bancare ale firmei sunt folosite pe documentele comerciale. Pentru o modificare, contactează Proprietarul organizației."
        />
      ) : null}
      {loadState === "error" ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          Datele firmei nu sunt disponibile.
        </InlineAlert>
      ) : null}
      {model && draft ? (
        <AdminColumns
          main={
            <>
              {model.completenessStatus !== "COMPLETE" ? (
                <InlineAlert tone={model.configured ? "pending" : "blocked"} title={model.completenessLabel}>
                  {model.configured
                    ? `Completează: ${model.missingRequiredLabels.join(", ")}.`
                    : "Ofertele nu pot fi înghețate până când nu salvezi cel puțin denumirea legală și identificatorul fiscal."}
                </InlineAlert>
              ) : null}
              {saveState === "success" && !dirty ? (
                <InlineAlert tone="success" title="Datele firmei au fost salvate">
                  Versiunea {model.version} este activă. Ofertele deja înghețate rămân neschimbate.
                </InlineAlert>
              ) : null}
              {saveState === "success" && warnings.length > 0 ? (
                <InlineAlert tone="pending" title="Salvat, cu observații">
                  {warnings.map((item) => `${item.label}: ${item.reason}`).join(" ")}
                </InlineAlert>
              ) : null}
              {(saveState === "error" || saveState === "conflict") && errorMessage ? (
                <InlineAlert tone="error" title={saveState === "conflict" ? "Modificare concurentă" : "Salvarea a eșuat"}>
                  {errorMessage}{" "}
                  {saveState === "conflict" ? (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setSaveState("idle");
                        setErrorMessage(null);
                        setDraft(null);
                        setSource(null);
                        invalidateResources(resourceKeys.companyIdentity(), resourceKeys.companyIdentityVersions());
                      }}
                    >
                      Reîncarcă datele curente
                    </button>
                  ) : null}
                </InlineAlert>
              ) : null}
              {!canEdit ? (
                <InlineAlert tone="pending" title="Doar citire">
                  Doar Proprietarul poate modifica datele firmei.
                </InlineAlert>
              ) : null}
              {GROUPS.map((group) => (
                <AdminSection
                  key={group.title}
                  title={group.title}
                  description={group.fields.includes("fiscalId") && model.fiscalIdCheck ? model.fiscalIdCheck : undefined}
                >
                  {group.fields
                    .filter((field) => model.fields.some((item) => item.field === field))
                    .map((field) => (
                      <AdminField
                        key={field}
                        id={`company-${field}`}
                        label={labelOf(field)}
                        help={FIELD_HELP[field]}
                        value={draft[field] ?? ""}
                        baseline={model.values[field] ?? ""}
                        readOnly={!canEdit}
                        disabled={pending}
                        variant="text"
                        error={issues.find((issue) => issue.field === field)?.reason ?? null}
                        onChange={(value) => setDraft({ ...draft, [field]: value })}
                      />
                    ))}
                </AdminSection>
              ))}
            </>
          }
          aside={
            <>
              <AdminContextBlock title={dirty ? "La salvare" : "Cum se folosesc"}>
                <AdminBullets items={SAVE_EFFECTS} />
              </AdminContextBlock>
              {canEdit ? (
                <div className="adm-versions">
                  <h3 className="adm-context__title">Istoricul modificărilor</h3>
                  {(versions.data ?? []).length === 0 ? (
                    <p className="adm-context__text">Nu există încă modificări înregistrate.</p>
                  ) : (
                    <ul className="cfc-history" aria-label="Istoricul modificărilor">
                      {(versions.data ?? []).map((row) => (
                        <li key={row.version}>
                          <strong>
                            v{row.version}
                            {row.version === model.version ? " · activă" : ""}
                          </strong>
                          <span>
                            {formatTimestamp(row.createdAt) ?? ""}
                            {row.createdByLabel ? ` · ${row.createdByLabel}` : ""}
                          </span>
                          <span>{row.changedLabels.length > 0 ? `Modificat: ${row.changedLabels.join(", ")}` : "Fără schimbări de valori"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </>
          }
        />
      ) : null}
      {reviewing && model && draft ? (
        <AdminReviewDialog
          subtitle={`Date firmă · se va crea versiunea ${model.version + 1}`}
          rows={changes.map(({ field, label }) => ({
            label,
            from: model.values[field] || "—",
            to: draft[field] || "—",
          }))}
          effects={SAVE_EFFECTS}
          confirmLabel={`Salvează versiunea ${model.version + 1}`}
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => void save(model)}
          onCancel={() => setReviewing(false)}
        />
      ) : null}
      {guard}
    </AdminLayout>
  );
}

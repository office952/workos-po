import { useState, type ReactNode } from "react";
import {
  presentCommercialPolicyAdmin,
  type CommercialPolicyAdminTransport,
} from "../adapters/commercialPolicyAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import { changeCountLabel } from "../admin/adminText";
import {
  AdminBullets,
  AdminChangeBar,
  AdminColumns,
  AdminContextBlock,
  AdminField,
  AdminReviewDialog,
  AdminSection,
  AdminVersionList,
} from "../admin/adminParts";
import { TransportError } from "../api/http";
import { postCommercialPolicy } from "../api/commercialPolicy";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { StateNotice } from "../components/StateNotice";
import { invalidateAfterCommercialPolicyChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCommercialPolicyAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";
import { useAdminLeaveGuard } from "../admin/useAdminLeaveGuard";

type SaveState = "idle" | "pending" | "success" | "error";
type Values = CommercialPolicyAdminTransport["editable"];

const FIELDS: readonly { key: keyof Values; label: string; help: string; unit: string; group: "offer" | "firm" }[] = [
  {
    key: "markupPercent",
    label: "Adaos implicit",
    help: "Punct de pornire pentru ofertele noi. Poate fi schimbat pe fiecare ofertă.",
    unit: "%",
    group: "offer",
  },
  {
    key: "defaultDiscountPercent",
    label: "Discount implicit",
    help: "Punct de pornire pentru ofertele noi. Poate fi schimbat pe fiecare ofertă.",
    unit: "%",
    group: "offer",
  },
  {
    key: "defaultAdjustment",
    label: "Ajustare implicită",
    help: "Sumă netă implicită (+/− EUR) pentru ofertele noi, fără TVA.",
    unit: "EUR",
    group: "offer",
  },
  {
    key: "vatPercent",
    label: "TVA",
    help: "TVA rămâne din politica firmei și nu se negociază pe ofertă.",
    unit: "%",
    group: "firm",
  },
];

/** What the existing contract states about a save (page copy before R3). */
const SAVE_EFFECTS = [
  "Salvarea creează o versiune nouă a politicii.",
  "Ofertele noi pornesc cu valorile noi; fiecare ofertă le poate modifica.",
  "Ofertele înghețate rămân neschimbate.",
] as const;

function parseDraft(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
}

function changedFields(base: Values, draft: Values) {
  return FIELDS.filter((field) => draft[field.key] !== base[field.key]);
}

export function CommercialAdminPage() {
  const admin = useResource(resourceKeys.commercialAdmin(), loadCommercialPolicyAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<CommercialPolicyAdminTransport | null>(null);
  const [draft, setDraft] = useState<Values | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const forbidden = admin.error instanceof TransportError && admin.error.status === 403;
  const loadState =
    admin.status === "error" && !admin.data
      ? forbidden
        ? "forbidden"
        : "error"
      : admin.data
        ? "ready"
        : "loading";

  const changes = model && draft ? changedFields(model.editable, draft) : [];
  const dirty = changes.length > 0;

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    setModel(admin.data);
    // A refreshed policy never overwrites what the owner is still editing.
    if (!dirty) setDraft(admin.data.editable);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Politica comercială nu este disponibilă.");
  }

  function discard(): void {
    if (model) setDraft(model.editable);
    setSaveState("idle");
    setErrorMessage(null);
    setReviewing(false);
  }

  async function save(): Promise<boolean> {
    if (!draft) return false;
    const markup = parseDraft(draft.markupPercent);
    const vat = parseDraft(draft.vatPercent);
    const discount = parseDraft(draft.defaultDiscountPercent);
    const adjustment = parseDraft(draft.defaultAdjustment);
    if (markup === null || vat === null || discount === null || adjustment === null) {
      setSaveState("error");
      setErrorMessage("Valorile comerciale trebuie să fie numere.");
      return false;
    }
    setSaveState("pending");
    setErrorMessage(null);
    const result = await postCommercialPolicy({
      markupPercent: markup,
      vatPercent: vat,
      defaultDiscountPercent: discount,
      defaultAdjustment: adjustment,
    });
    if (result.ok) {
      const presented = presentCommercialPolicyAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Serverul a confirmat salvarea, dar răspunsul nu poate fi afișat. Reîncarcă pagina pentru a vedea valorile active.");
        return false;
      }
      writeResource(resourceKeys.commercialAdmin(), presented);
      setSource(presented);
      setModel(presented);
      setDraft(presented.editable);
      invalidateAfterCommercialPolicyChange();
      setSaveState("success");
      setReviewing(false);
      return true;
    }
    setSaveState("error");
    setErrorMessage(
      adminFailureContent(describeAdminFailure(result.status, result.body, { forbidden: "Nu ai dreptul să modifici politica comercială." }, "Politica comercială nu a putut fi salvată.")),
    );
    return false;
  }

  /** The one way to save: the change bar and the leave question both open the same review. */
  function openReview(): void {
    setSaveState("idle");
    setErrorMessage(null);
    setReviewing(true);
  }

  const guard = useAdminLeaveGuard({
    dirty,
    subject: "Valorile comerciale",
    requestSave: openReview,
    saveFlowOpen: reviewing || saveState === "pending",
    onDiscard: discard,
  });

  const pending = saveState === "pending";
  const canEdit = Boolean(model?.canEdit);
  const nextVersion = (model?.activeVersion ?? 0) + 1;
  const parseError = saveState === "error" && errorMessage === "Valorile comerciale trebuie să fie numere.";

  const meta =
    loadState === "ready" && model ? (
      <>
        {/* The guidance notice already names a system policy; the meta does not repeat it. */}
        {model.guidance && model.source === "CODE_DEFAULT" ? null : (
          <span>
            {model.sourceLabel ?? "Politică de sistem"}
            {model.activeVersion !== null ? ` · versiunea ${model.activeVersion} activă` : ""}
          </span>
        )}
        <span>
          {presentAdminEditMeta({
            settled: true,
            canEdit,
            whenEditable: "Doar proprietarul poate confirma politica organizației.",
            whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
          })}
        </span>
      </>
    ) : undefined;

  return (
    <AdminLayout
      current="commercial"
      title="Valori comerciale"
      lead="Punctul de pornire pentru ofertele noi. Fiecare ofertă le poate modifica. Prețul de vânzare nu se calculează automat din costul intern."
      meta={meta}
      changeBar={
        dirty && canEdit ? (
          <AdminChangeBar
            title={changeCountLabel(changes.length)}
            detail={changes
              .map((field) => `${field.label} ${model?.editable[field.key] || "—"} → ${draft?.[field.key] || "—"} ${field.unit}`)
              .join(" · ")}
            pending={pending}
            onDiscard={discard}
            onSave={openReview}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă politica comercială" /> : null}
      {loadState === "forbidden" ? (
        <StateNotice
          kind="read-only"
          title="Acces doar pentru proprietar"
          reason="Valorile comerciale sunt disponibile doar proprietarului organizației. Adaosul, TVA-ul, discountul și ajustarea implicită se văd și se modifică doar din contul proprietarului. Pentru o schimbare, contactează proprietarul organizației."
        />
      ) : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model && draft ? (
        <AdminColumns
          main={
            <>
              {model.guidance ? (
                <InlineAlert
                  tone={model.resolutionOk ? "pending" : "blocked"}
                  title={
                    !model.resolutionOk
                      ? "Politica trebuie configurată"
                      : model.source === "CODE_DEFAULT"
                        ? "Politică de sistem"
                        : "Punct de pornire pentru oferte noi"
                  }
                >
                  {model.guidance}
                </InlineAlert>
              ) : null}
              {saveState === "success" && !dirty ? (
                <InlineAlert tone="success" title="Politica a fost salvată">
                  Versiunea activă este {model.activeVersion ?? "1"}. Ofertele vechi rămân neschimbate.
                </InlineAlert>
              ) : null}
              {saveState === "error" && errorMessage && !reviewing ? (
                <InlineAlert tone="error" title="Salvarea a eșuat">
                  {errorMessage} Modificările tale sunt păstrate.
                </InlineAlert>
              ) : null}
              <AdminSection title="Pentru ofertele noi">
                {FIELDS.filter((field) => field.group === "offer").map((field) => (
                  <AdminField
                    key={field.key}
                    id={field.key}
                    label={field.label}
                    help={field.help}
                    unit={field.unit}
                    inputMode="decimal"
                    value={draft[field.key]}
                    baseline={model.editable[field.key]}
                    readOnly={!canEdit}
                    disabled={pending}
                    error={parseError && parseDraft(draft[field.key]) === null ? "Trebuie să fie un număr." : null}
                    onChange={(value) => setDraft({ ...draft, [field.key]: value })}
                  />
                ))}
              </AdminSection>
              <AdminSection title="Politica firmei">
                {FIELDS.filter((field) => field.group === "firm").map((field) => (
                  <AdminField
                    key={field.key}
                    id={field.key}
                    label={field.label}
                    help={field.help}
                    unit={field.unit}
                    inputMode="decimal"
                    value={draft[field.key]}
                    baseline={model.editable[field.key]}
                    readOnly={!canEdit}
                    disabled={pending}
                    error={parseError && parseDraft(draft[field.key]) === null ? "Trebuie să fie un număr." : null}
                    onChange={(value) => setDraft({ ...draft, [field.key]: value })}
                  />
                ))}
              </AdminSection>
              <AdminSection title="Stabilite de sistem">
                <AdminField id="currency" label="Monedă" help="Nu se configurează încă." value={model.readOnly.currency} readOnly />
                <AdminField id="rounding" label="Rotunjire" help="Nu se configurează încă." value={model.readOnly.rounding} readOnly />
              </AdminSection>
            </>
          }
          aside={
            <>
              <AdminContextBlock title={dirty ? "La salvare" : "Cum se folosesc"}>
                <AdminBullets items={SAVE_EFFECTS} />
              </AdminContextBlock>
              <AdminVersionList
                rows={[...model.history].reverse().map((row) => ({
                  key: String(row.version),
                  version: `v${row.version}`,
                  active: row.version === model.activeVersion,
                  when: formatTimestamp(row.effectiveFrom ?? row.createdAt) ?? null,
                  detail: row.version === model.activeVersion ? null : row.status || null,
                }))}
                highlightActive={saveState === "success" && !dirty}
                emptyText="Nu există încă o versiune confirmată de organizație."
              />
            </>
          }
        />
      ) : null}
      {reviewing && model && draft ? (
        <AdminReviewDialog
          subtitle={`Valori comerciale · se va crea versiunea ${nextVersion}`}
          rows={changes.map((field) => ({
            label: field.label,
            from: `${model.editable[field.key] || "—"} ${field.unit}`,
            to: `${draft[field.key] || "—"} ${field.unit}`,
          }))}
          unchanged={
            FIELDS.length > changes.length
              ? `Rămân neschimbate: ${FIELDS.filter((field) => !changes.includes(field))
                  .map((field) => field.label.toLocaleLowerCase("ro-RO"))
                  .join(", ")}, moneda și rotunjirea.`
              : "Rămân neschimbate: moneda și rotunjirea."
          }
          effects={SAVE_EFFECTS}
          confirmLabel={`Salvează versiunea ${nextVersion}`}
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            void save();
          }}
          onCancel={() => setReviewing(false)}
        />
      ) : null}
      {guard}
    </AdminLayout>
  );
}

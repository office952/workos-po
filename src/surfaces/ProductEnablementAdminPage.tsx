import { useState, type ReactNode } from "react";
import {
  presentProductEnablementAdmin,
  type ProductEnablementAdminTransport,
} from "../adapters/productEnablementAdapter";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import { changeCountLabel } from "../admin/adminText";
import {
  AdminBullets,
  AdminChangeBar,
  AdminColumns,
  AdminContextBlock,
  AdminReviewDialog,
  AdminSection,
  AdminVersionList,
} from "../admin/adminParts";
import { postProductEnablement } from "../api/productEnablement";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterProductEnablementChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadProductEnablementAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";
import { useAdminLeaveGuard } from "../admin/useAdminLeaveGuard";

type SaveState = "idle" | "pending" | "success" | "error";

const OFFERED_FOR_NEW_WORK_HINT = "Oferit pentru lucrări noi. Ofertele existente rămân deschise.";
const NOT_OFFERED_FOR_NEW_WORK_HINT = "Nu este oferit pentru lucrări noi. Ofertele existente rămân deschise.";
const DRAFT_OFFERED_HINT = "Selectat ca oferit pentru lucrări noi. Nu este salvat.";
const DRAFT_NOT_OFFERED_HINT = "Selectat ca neoferit pentru lucrări noi. Nu este salvat.";

function productOfferHint(enabled: boolean, dirty: boolean): string {
  if (dirty) return enabled ? DRAFT_OFFERED_HINT : DRAFT_NOT_OFFERED_HINT;
  return enabled ? OFFERED_FOR_NEW_WORK_HINT : NOT_OFFERED_FOR_NEW_WORK_HINT;
}

function initialSelection(model: ProductEnablementAdminTransport): Record<string, boolean> {
  return Object.fromEntries(model.products.map((item) => [item.templateCode, item.enabled]));
}

export function ProductEnablementAdminPage() {
  const admin = useResource(resourceKeys.productEnablementAdmin(), loadProductEnablementAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<ProductEnablementAdminTransport | null>(null);
  const [enabledByCode, setEnabledByCode] = useState<Record<string, boolean>>({});
  const [reviewing, setReviewing] = useState(false);

  const loadState =
    admin.status === "error" && !admin.data ? "error" : admin.data ? "ready" : "loading";

  const changed =
    model?.products.filter((product) => (enabledByCode[product.templateCode] === true) !== product.enabled) ?? [];
  const dirty = changed.length > 0;

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    setModel(admin.data);
    // A refresh does not overwrite a selection still being edited.
    if (!dirty) setEnabledByCode(initialSelection(admin.data));
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Selecția de produse nu este disponibilă.");
  }

  function discard(): void {
    if (model) setEnabledByCode(initialSelection(model));
    setSaveState("idle");
    setErrorMessage(null);
    setReviewing(false);
  }

  async function save(): Promise<boolean> {
    if (!model) return false;
    setSaveState("pending");
    setErrorMessage(null);
    const result = await postProductEnablement({
      products: model.products.map((item) => ({
        templateCode: item.templateCode,
        enabled: enabledByCode[item.templateCode] === true,
      })),
    });
    if (result.ok) {
      const presented = presentProductEnablementAdmin(result.body);
      if (!presented) {
        setSaveState("error");
        setErrorMessage("Serverul a confirmat salvarea, dar răspunsul nu poate fi afișat. Reîncarcă pagina pentru a vedea valorile active.");
        return false;
      }
      writeResource(resourceKeys.productEnablementAdmin(), presented);
      setSource(presented);
      setModel(presented);
      setEnabledByCode(initialSelection(presented));
      invalidateAfterProductEnablementChange();
      setSaveState("success");
      setReviewing(false);
      return true;
    }
    setSaveState("error");
    setErrorMessage(
      adminFailureContent(describeAdminFailure(result.status, result.body, { forbidden: "Nu ai dreptul să modifici produsele oferite." }, "Selecția de produse nu a putut fi salvată.")),
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
    subject: "Selecția de produse",
    requestSave: openReview,
    saveFlowOpen: reviewing || saveState === "pending",
    onDiscard: discard,
  });

  const pending = saveState === "pending";
  const canEdit = Boolean(model?.canEdit);
  const nextVersion = (model?.activeVersion ?? 0) + 1;
  const offeredLabel = (enabled: boolean) => (enabled ? "Oferit" : "Neoferit");
  const effects = [
    `Se creează versiunea ${nextVersion} a selecției.`,
    ...changed.map((product) =>
      enabledByCode[product.templateCode] === true
        ? `${product.label} apare pentru lucrări noi.`
        : `${product.label} nu mai apare pentru lucrări noi.`,
    ),
    "Ofertele și lucrările existente rămân deschise.",
  ];

  return (
    <AdminLayout
      current="products"
      title="Produse oferite"
      lead="Alege ce produse apar în catalog pentru lucrările noi. Ofertele și lucrările vechi rămân deschise."
      meta={
        loadState === "ready" && model ? (
          <>
            {/* The guidance notice already names a system selection; the meta does not repeat it. */}
            {model.guidance && model.source === "CODE_DEFAULT" ? null : (
              <span>
                {model.sourceLabel ?? "Selecție de sistem"}
                {model.activeVersion !== null ? ` · versiunea ${model.activeVersion} activă` : ""}
              </span>
            )}
            <span>
              {presentAdminEditMeta({
                settled: true,
                canEdit,
                whenEditable: "Doar proprietarul poate confirma produsele oferite de firmă.",
                whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
              })}
            </span>
          </>
        ) : undefined
      }
      changeBar={
        dirty && canEdit ? (
          <AdminChangeBar
            title={changeCountLabel(changed.length)}
            detail={changed
              .map(
                (product) =>
                  `${product.label}: ${offeredLabel(product.enabled)} → ${offeredLabel(enabledByCode[product.templateCode] === true)}`,
              )
              .join(" · ")}
            pending={pending}
            onDiscard={discard}
            onSave={openReview}
          />
        ) : null
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă produsele oferite" /> : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <AdminColumns
          main={
            <>
              {model.guidance ? (
                <InlineAlert
                  tone={model.resolutionOk ? "pending" : "blocked"}
                  title={
                    !model.resolutionOk
                      ? "Selecția trebuie configurată"
                      : model.source === "CODE_DEFAULT"
                        ? "Selecție de sistem"
                        : "Catalog pentru lucrări noi"
                  }
                >
                  {model.guidance}
                </InlineAlert>
              ) : null}
              {saveState === "success" && !dirty ? (
                <InlineAlert tone="success" title="Selecția a fost salvată">
                  Versiunea activă este {model.activeVersion ?? "1"}. Ofertele și lucrările vechi rămân deschise.
                </InlineAlert>
              ) : null}
              {saveState === "error" && errorMessage && !reviewing ? (
                <InlineAlert tone="error" title="Salvarea a eșuat">
                  {errorMessage} Modificările tale sunt păstrate.
                </InlineAlert>
              ) : null}
              <AdminSection title="Produse partajate">
                {model.products.map((product) => {
                  const offered = enabledByCode[product.templateCode] === true;
                  const productDirty = offered !== product.enabled;
                  const hintId = `offer-${product.templateCode}-hint`;
                  return (
                    <fieldset
                      key={product.templateCode}
                      className="adm-offer"
                      data-state={productDirty ? "modified" : undefined}
                      aria-describedby={hintId}
                      disabled={!canEdit || pending}
                    >
                      <legend className="adm-offer__label">
                        {productDirty ? <span className="adm-dot" aria-hidden="true" /> : null}
                        {product.label}
                      </legend>
                      <p className="adm-offer__hint" id={hintId}>
                        {productOfferHint(offered, productDirty)}
                      </p>
                      <div className="adm-segment">
                        {[true, false].map((value) => (
                          <label key={String(value)} className="adm-segment__option" data-selected={offered === value ? "true" : undefined}>
                            <input
                              type="radio"
                              name={`offer-${product.templateCode}`}
                              checked={offered === value}
                              onChange={() =>
                                setEnabledByCode((current) => ({ ...current, [product.templateCode]: value }))
                              }
                            />
                            <span>{offeredLabel(value)}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </AdminSection>
            </>
          }
          aside={
            <>
              <AdminContextBlock title={dirty ? "La salvare" : "Cum se folosesc"}>
                <AdminBullets
                  items={
                    dirty
                      ? effects
                      : ["Salvarea creează o versiune nouă a selecției.", "Ofertele și lucrările existente rămân deschise."]
                  }
                />
              </AdminContextBlock>
              <AdminVersionList
                rows={[...model.history].reverse().map((row) => ({
                  key: String(row.version),
                  version: `v${row.version}`,
                  active: row.version === model.activeVersion,
                  when: formatTimestamp(row.effectiveFrom ?? row.createdAt) ?? row.sourceLabel,
                  detail: row.offeredCount !== null ? `${row.offeredCount} oferite` : null,
                }))}
                highlightActive={saveState === "success" && !dirty}
                emptyText="Nu există încă o selecție confirmată de organizație."
              />
            </>
          }
        />
      ) : null}
      {reviewing && model ? (
        <AdminReviewDialog
          subtitle={`Produse oferite · se va crea versiunea ${nextVersion}`}
          rows={changed.map((product) => ({
            label: product.label,
            from: offeredLabel(product.enabled),
            to: offeredLabel(enabledByCode[product.templateCode] === true),
          }))}
          unchanged={model.products.length > changed.length ? "Celelalte produse rămân cum sunt." : null}
          effects={effects.slice(1)}
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

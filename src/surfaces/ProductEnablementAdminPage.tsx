import { useState } from "react";
import {
  presentProductEnablementAdmin,
  type ProductEnablementAdminTransport,
} from "../adapters/productEnablementAdapter";
import { readTransportErrorCode, readTransportReasons } from "../api/http";
import { postProductEnablement } from "../api/productEnablement";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { FieldFrame, fieldDescribedBy } from "../components/FieldFrame";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterProductEnablementChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadProductEnablementAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";

type SaveState = "idle" | "pending" | "success" | "error";

const OFFERED_FOR_NEW_WORK_HINT =
  "Oferit pentru lucrări noi. Ofertele existente rămân deschise.";
const NOT_OFFERED_FOR_NEW_WORK_HINT =
  "Nu este oferit pentru lucrări noi. Ofertele existente rămân deschise.";
const DRAFT_OFFERED_HINT =
  "Selectat ca oferit pentru lucrări noi. Nu este salvat.";
const DRAFT_NOT_OFFERED_HINT =
  "Selectat ca neoferit pentru lucrări noi. Nu este salvat.";

function productOfferHint(enabled: boolean, dirty: boolean): string {
  if (dirty) {
    return enabled ? DRAFT_OFFERED_HINT : DRAFT_NOT_OFFERED_HINT;
  }
  return enabled ? OFFERED_FOR_NEW_WORK_HINT : NOT_OFFERED_FOR_NEW_WORK_HINT;
}

function selectionIsDirty(
  products: ProductEnablementAdminTransport["products"],
  enabledByCode: Record<string, boolean>,
): boolean {
  return products.some(
    (product) => (enabledByCode[product.templateCode] === true) !== product.enabled,
  );
}

export function ProductEnablementAdminPage() {
  const admin = useResource(
    resourceKeys.productEnablementAdmin(),
    loadProductEnablementAdmin,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<ProductEnablementAdminTransport | null>(null);
  const [enabledByCode, setEnabledByCode] = useState<Record<string, boolean>>({});

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  function applyAdmin(next: ProductEnablementAdminTransport): void {
    setModel(next);
    setEnabledByCode(
      Object.fromEntries(next.products.map((item) => [item.templateCode, item.enabled])),
    );
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Selecția de produse nu este disponibilă.");
  }

  async function save(): Promise<void> {
    if (!model) {
      return;
    }
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
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return;
      }
      writeResource(resourceKeys.productEnablementAdmin(), presented);
      applyAdmin(presented);
      invalidateAfterProductEnablementChange();
      setSaveState("success");
      return;
    }
    setSaveState("error");
    setErrorMessage(
      readTransportReasons(result.body)[0] ??
        (readTransportErrorCode(result.body) === "forbidden"
          ? "Nu ai dreptul să modifici produsele oferite."
          : "Selecția de produse nu a putut fi salvată."),
    );
  }

  const pending = saveState === "pending";
  const editEnabled = Boolean(model?.canEdit) && !pending;
  const dirty = Boolean(model && selectionIsDirty(model.products, enabledByCode));

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/products"
      workspace="admin"
      eyebrow="Administrare"
      title="Produse oferite"
      lead="Alege ce produse apar în catalogul pentru lucrări noi. Ofertele și lucrările vechi rămân deschise."
      meta={presentAdminEditMeta({
        settled: loadState === "ready" && model !== null,
        canEdit: Boolean(model?.canEdit),
        whenEditable: "Doar proprietarul poate confirma produsele oferite de firmă.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("products")}
          />
          <SurfacePanel title="Produse partajate" label="Produse" busy>
            <LoadingFloor variant="admin" label="Se încarcă produsele oferite" />
          </SurfacePanel>
        </>
      ) : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("products")}
          />
          <SurfacePanel
            title="Produse partajate"
            label="Produse"
            status={
              <StatusBadge
                label={model.sourceLabel ?? "Selecție de sistem"}
                tone={model.source === "ORGANIZATION" ? "ready" : "pending"}
              />
            }
          >
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
            {dirty ? (
              <InlineAlert tone="pending" title="Modificările nu sunt salvate">
                Lucrările noi rămân pe selecția actuală până apeși Salvează.
              </InlineAlert>
            ) : null}
            {saveState === "success" && !dirty ? (
              <InlineAlert tone="success" title="Selecția a fost salvată">
                Versiunea activă este {model.activeVersion ?? "1"}. Ofertele și lucrările
                vechi rămân deschise.
              </InlineAlert>
            ) : null}
            {saveState === "error" && errorMessage ? (
              <InlineAlert tone="error" title="Salvarea a eșuat">
                {errorMessage}
              </InlineAlert>
            ) : null}
            {model.activeVersion !== null ? (
              <dl>
                <InfoRow label="Versiune activă" value={String(model.activeVersion)} />
              </dl>
            ) : null}
            {model.products.map((product) => {
              const fieldId = `enable-${product.templateCode}`;
              const offered = enabledByCode[product.templateCode] === true;
              const hint = productOfferHint(offered, offered !== product.enabled);
              return (
                <FieldFrame
                  key={product.templateCode}
                  id={fieldId}
                  label={product.label}
                  hint={hint}
                >
                  <input
                    id={fieldId}
                    className="field__control"
                    type="checkbox"
                    checked={offered}
                    disabled={!editEnabled}
                    aria-describedby={fieldDescribedBy(fieldId, hint)}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setEnabledByCode((current) => ({
                        ...current,
                        [product.templateCode]: enabled,
                      }));
                    }}
                  />
                </FieldFrame>
              );
            })}
            {model.canEdit ? (
              <>
                <Button
                  disabled={pending || !dirty}
                  onClick={() => {
                    void save();
                  }}
                >
                  Salvează produsele oferite
                </Button>
                {dirty ? (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      applyAdmin(model);
                      setSaveState("idle");
                    }}
                  >
                    Renunță la modificări
                  </Button>
                ) : null}
              </>
            ) : null}
            {pending ? <LoadingIndicator label="Se salvează produsele oferite" /> : null}
          </SurfacePanel>
          <SurfacePanel title="Istoric versiuni" label="Istoric">
            {model.history.length === 0 ? (
              <p>Nu există încă o selecție confirmată de organizație.</p>
            ) : (
              <Worklist variant="compact" label="Versiuni produse oferite">
                {[...model.history].reverse().map((row) => (
                  <WorklistRow
                    key={row.version}
                    variant="compact"
                    identity={`Versiunea ${row.version}`}
                    identityDetail={row.status}
                    context={
                      formatTimestamp(row.effectiveFrom ?? row.createdAt) ??
                      row.sourceLabel
                    }
                  />
                ))}
              </Worklist>
            )}
          </SurfacePanel>
        </>
      ) : null}
    </SlicePage>
  );
}

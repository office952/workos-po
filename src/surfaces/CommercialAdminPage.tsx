import { useState } from "react";
import {
  presentCommercialPolicyAdmin,
  type CommercialPolicyAdminTransport,
} from "../adapters/commercialPolicyAdapter";
import { readTransportErrorCode, readTransportReasons } from "../api/http";
import { postCommercialPolicy } from "../api/commercialPolicy";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { Worklist } from "../components/Worklist";
import { WorklistRow } from "../components/WorklistRow";
import { invalidateAfterCommercialPolicyChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadCommercialPolicyAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";

type SaveState = "idle" | "pending" | "success" | "error";

function parseDraft(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function CommercialAdminPage() {
  const admin = useResource(resourceKeys.commercialAdmin(), loadCommercialPolicyAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<CommercialPolicyAdminTransport | null>(null);
  const [markupPercent, setMarkupPercent] = useState("");
  const [vatPercent, setVatPercent] = useState("");
  const [defaultDiscountPercent, setDefaultDiscountPercent] = useState("");
  const [defaultAdjustment, setDefaultAdjustment] = useState("");

  const loadState =
    admin.status === "error" && !admin.data
      ? "error"
      : admin.data
        ? "ready"
        : "loading";

  function applyAdmin(next: CommercialPolicyAdminTransport): void {
    setModel(next);
    setMarkupPercent(next.editable.markupPercent);
    setVatPercent(next.editable.vatPercent);
    setDefaultDiscountPercent(next.editable.defaultDiscountPercent);
    setDefaultAdjustment(next.editable.defaultAdjustment);
  }

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    applyAdmin(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Politica comercială nu este disponibilă.");
  }

  async function save(): Promise<void> {
    const markup = parseDraft(markupPercent);
    const vat = parseDraft(vatPercent);
    const discount = parseDraft(defaultDiscountPercent);
    const adjustment = parseDraft(defaultAdjustment);
    if (markup === null || vat === null || discount === null || adjustment === null) {
      setSaveState("error");
      setErrorMessage("Valorile comerciale trebuie să fie numere.");
      return;
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
        setErrorMessage("Salvarea a reușit, dar răspunsul nu poate fi prezentat.");
        return;
      }
      writeResource(resourceKeys.commercialAdmin(), presented);
      applyAdmin(presented);
      invalidateAfterCommercialPolicyChange();
      setSaveState("success");
      return;
    }
    setSaveState("error");
    setErrorMessage(
      readTransportReasons(result.body)[0] ??
        (readTransportErrorCode(result.body) === "forbidden"
          ? "Nu ai dreptul să modifici politica comercială."
          : "Politica comercială nu a putut fi salvată."),
    );
  }

  const pending = saveState === "pending";
  const editEnabled = Boolean(model?.canEdit) && !pending;

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/commercial"
      workspace="admin"
      eyebrow="Administrare"
      title="Valori comerciale implicite"
      lead="Aceste valori sunt folosite ca punct de pornire pentru ofertele noi. Pot fi modificate individual pe fiecare ofertă. Salvarea creează o versiune nouă. Ofertele înghețate rămân neschimbate."
      meta={
        model?.canEdit
          ? "Doar Owner poate confirma politica organizației."
          : "Editarea nu este disponibilă pentru acest rol."
      }
    >
      {loadState === "loading" ? (
        <>
          <CollectionRail
            label="Administrare"
            items={administrationRailItems("commercial")}
          />
          <SurfacePanel title="Politica curentă" label="Politică" busy>
            <LoadingFloor variant="admin" label="Se încarcă politica comercială" />
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
            items={administrationRailItems("commercial")}
          />
          <SurfacePanel
            title="Politica curentă"
            label="Politică"
            status={
              <StatusBadge
                label={model.sourceLabel ?? "Politică de sistem"}
                tone={model.source === "ORGANIZATION" ? "ready" : "pending"}
              />
            }
          >
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
            {saveState === "success" ? (
              <InlineAlert tone="success" title="Politica a fost salvată">
                Versiunea activă este {model.activeVersion ?? "1"}. Ofertele vechi rămân
                neschimbate.
              </InlineAlert>
            ) : null}
            {saveState === "error" && errorMessage ? (
              <InlineAlert tone="error" title="Salvarea a eșuat">
                {errorMessage}
              </InlineAlert>
            ) : null}
            <dl>
              <InfoRow label="Monedă" value={model.readOnly.currency} />
              <InfoRow label="Rotunjire" value={model.readOnly.rounding} />
              {model.activeVersion !== null ? (
                <InfoRow label="Versiune activă" value={String(model.activeVersion)} />
              ) : null}
            </dl>
            <TextField
              id="markupPercent"
              label="Adaos implicit (%)"
              hint="Punct de pornire pentru ofertele noi. Poate fi schimbat pe fiecare ofertă."
              value={markupPercent}
              inputMode="decimal"
              disabled={!editEnabled}
              onChange={setMarkupPercent}
            />
            <TextField
              id="vatPercent"
              label="TVA (%)"
              hint="TVA rămâne din politica firmei și nu se negociază pe ofertă."
              value={vatPercent}
              inputMode="decimal"
              disabled={!editEnabled}
              onChange={setVatPercent}
            />
            <TextField
              id="defaultDiscountPercent"
              label="Discount implicit (%)"
              hint="Punct de pornire pentru ofertele noi. Poate fi schimbat pe fiecare ofertă."
              value={defaultDiscountPercent}
              inputMode="decimal"
              disabled={!editEnabled}
              onChange={setDefaultDiscountPercent}
            />
            <TextField
              id="defaultAdjustment"
              label="Ajustare implicită"
              hint="Sumă netă implicită (+/− EUR) pentru ofertele noi, fără TVA."
              value={defaultAdjustment}
              inputMode="decimal"
              disabled={!editEnabled}
              onChange={setDefaultAdjustment}
            />
            {model.canEdit ? (
              <Button
                disabled={pending}
                onClick={() => {
                  void save();
                }}
              >
                Salvează politica
              </Button>
            ) : (
              <p>Editarea nu este disponibilă pentru acest rol.</p>
            )}
            {pending ? <LoadingIndicator label="Se salvează politica comercială" /> : null}
          </SurfacePanel>
          <SurfacePanel title="Istoric versiuni" label="Istoric">
            {model.history.length === 0 ? (
              <p>Nu există încă o versiune confirmată de organizație.</p>
            ) : (
              <Worklist variant="compact" label="Versiuni politică">
                {[...model.history].reverse().map((row) => (
                  <WorklistRow
                    key={row.version}
                    variant="compact"
                    identity={`Versiunea ${row.version}`}
                    identityDetail={row.status}
                    context={
                      formatTimestamp(row.effectiveFrom ?? row.createdAt) ??
                      row.source
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

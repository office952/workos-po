import { useState } from "react";
import { presentRequestDetail } from "../adapters/requestAdapter";
import { TransportError, readTransportErrorCode } from "../api/http";
import { patchRequest, patchRequestInstallationFacts } from "../api/requests";
import type {
  RequestDetailTransport,
  RequestInstallationFactsTransport,
  RequestInstallationOfferTransport,
  RequestPatchInput,
} from "../api/types";
import { Button } from "../components/Button";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { TextField } from "../components/TextField";
import { invalidateResources, writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import {
  ELECTRICAL_STATE_OPTIONS,
  FACADE_TYPE_OPTIONS,
  FIXING_METHOD_OPTIONS,
  MEASUREMENT_STATUS_OPTIONS,
  presentElectricalStateLabel,
  presentFacadeTypeLabel,
  presentFixingMethodLabel,
  presentInstallationModeLabel,
  presentInstallationModeOptions,
  presentMeasurementStatusLabel,
} from "../presentation/installationFacts";

type RequestInstallationSectionProps = {
  detail: RequestDetailTransport;
};

type FactsDraft = {
  siteName: string;
  street: string;
  city: string;
  county: string;
  postalCode: string;
  contactName: string;
  contactPhone: string;
  accessNotes: string;
  measurementStatus: string;
  mountingSurfaceWidthMm: string;
  mountingSurfaceHeightMm: string;
  installationElevationMm: string;
  facadeType: string;
  fixingMethod: string;
  siteElectrical: string;
  crewSize: string;
  plannedDurationHours: string;
};

function draftFromFacts(facts: RequestInstallationFactsTransport | null): FactsDraft {
  return {
    siteName: facts?.siteName ?? "",
    street: facts?.street ?? "",
    city: facts?.city ?? "",
    county: facts?.county ?? "",
    postalCode: facts?.postalCode ?? "",
    contactName: facts?.contactName ?? "",
    contactPhone: facts?.contactPhone ?? "",
    accessNotes: facts?.accessNotes ?? "",
    measurementStatus: facts?.measurementStatus || "UNCONFIRMED",
    mountingSurfaceWidthMm: facts?.mountingSurfaceWidthMm?.toString() ?? "",
    mountingSurfaceHeightMm: facts?.mountingSurfaceHeightMm?.toString() ?? "",
    installationElevationMm: facts?.installationElevationMm?.toString() ?? "",
    facadeType: facts?.facadeType || "UNCONFIRMED",
    fixingMethod: facts?.fixingMethod || "UNCONFIRMED",
    siteElectrical: facts?.siteElectrical || "UNCONFIRMED",
    crewSize: facts?.crewSize?.toString() ?? "",
    plannedDurationHours: facts?.plannedDurationHours?.toString() ?? "",
  };
}

function readOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function presentOfferMutationError(code: string | null): string {
  switch (code) {
    case "installation_facts_delete_confirmation_required":
      return "Datele de montaj salvate vor fi șterse. Confirmă ștergerea.";
    case "service_selection_locked":
      return "Selecția de montaj nu mai poate fi modificată.";
    case "service_not_offered":
      return "Montajul nu este disponibil pentru organizație.";
    case "service_mode_required":
      return "Alege modul de montaj.";
    case "service_mode_unavailable":
    case "invalid_service_mode":
      return "Modul de montaj nu este disponibil.";
    default:
      return "Selecția de montaj nu a putut fi actualizată.";
  }
}

export function RequestInstallationSection({ detail }: RequestInstallationSectionProps) {
  const offer = detail.installationOffer;
  const selected = offer?.selected ?? false;
  const facts = detail.installationFacts;
  const editorKey = String(facts?.version ?? 0);

  return (
    <SurfacePanel title="Montaj" label="Montaj">
      <RequestInstallationOfferControls detail={detail} offer={offer} />
      {selected ? (
        <>
          {detail.installationScope?.incompleteReasons.length ? (
            <ul className="stack">
              {detail.installationScope.incompleteReasons.map((reason) => (
                <li key={reason.id}>{reason.label}</li>
              ))}
            </ul>
          ) : null}
          {!detail.canWriteInstallationFacts ? (
            <RequestInstallationFactsReadout facts={facts} />
          ) : (
            <RequestInstallationFactsEditor
              key={editorKey}
              detail={detail}
              facts={facts}
            />
          )}
        </>
      ) : null}
    </SurfacePanel>
  );
}

function RequestInstallationOfferControls({
  detail,
  offer,
}: {
  detail: RequestDetailTransport;
  offer: RequestInstallationOfferTransport | null;
}) {
  const selected = offer?.selected ?? false;
  const [draftMode, setDraftMode] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const modeOptions = presentInstallationModeOptions(offer?.availableModes ?? []);
  const selectedModeValue =
    offer?.mode && offer.availableModes.includes(offer.mode) ? offer.mode : "";

  async function applyOffer(input: RequestPatchInput): Promise<void> {
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentRequestDetail(await patchRequest(detail.requestId, input));
      if (!presented) {
        setSaveState("error");
        setSaveError("Selecția de montaj nu a putut fi prezentată.");
        return;
      }
      writeResource(resourceKeys.request(detail.requestId), presented);
      invalidateResources(resourceKeys.requests());
      setConfirmingDelete(false);
      setDraftMode("");
      setSaveState("idle");
    } catch (error) {
      const code = error instanceof TransportError ? readTransportErrorCode(error.body) : null;
      if (code === "installation_facts_delete_confirmation_required") {
        setConfirmingDelete(true);
      }
      setSaveState("error");
      setSaveError(presentOfferMutationError(code));
    }
  }

  function requestDeselection(): void {
    if (detail.installationFacts) {
      setConfirmingDelete(true);
      setSaveError(null);
      return;
    }
    void applyOffer({ optionalScopeIds: [] });
  }

  const addDisabled =
    saveState === "pending" ||
    Boolean(offer?.showModeControl && !draftMode);

  return (
    <div className="stack">
      {selected ? (
        <dl className="fact-grid">
          <InfoRow label="Serviciu" value={offer?.label ?? "Montaj la locație"} />
          <InfoRow label="Mod" value={presentInstallationModeLabel(offer?.mode ?? null)} />
        </dl>
      ) : (
        <p>Montajul la locație nu este selectat pe această cerere.</p>
      )}
      {offer?.selectionLocked ? (
        <p className="ui-note">Selecția de montaj nu mai poate fi modificată.</p>
      ) : null}
      {offer?.persistedSelectionPreserved ? (
        <p className="ui-note">Montajul păstrat pe cerere rămâne vizibil.</p>
      ) : null}
      {offer?.persistedModeIncompatible ? (
        <p className="ui-note">Modul salvat nu mai este disponibil. Alege un mod acceptat.</p>
      ) : null}
      {offer && !offer.selected && offer.canSelectNew && offer.canChangeSelection ? (
        <>
          {offer.showModeControl ? (
            <SelectField
              id="install-offer-mode"
              label="Mod montaj"
              value={draftMode}
              options={modeOptions}
              onChange={setDraftMode}
            />
          ) : null}
          <Button
            disabled={addDisabled}
            onClick={() =>
              void applyOffer({
                optionalScopeIds: [offer.capabilityId],
                ...(draftMode ? { siteInstallationMode: draftMode } : {}),
              })
            }
          >
            Adaugă montaj
          </Button>
        </>
      ) : null}
      {offer?.selected && offer.canChangeMode && modeOptions.length > 0 ? (
        <SelectField
          id="install-change-mode"
          label="Mod montaj"
          value={selectedModeValue}
          options={modeOptions}
          disabled={saveState === "pending"}
          onChange={(value) => void applyOffer({ siteInstallationMode: value })}
        />
      ) : null}
      {offer?.selected && offer.canChangeSelection && !confirmingDelete ? (
        <Button
          variant="secondary"
          disabled={saveState === "pending"}
          onClick={requestDeselection}
        >
          Elimină montaj
        </Button>
      ) : null}
      {confirmingDelete ? (
        <>
          <InlineAlert tone="blocked" title="Datele de montaj vor fi șterse">
            Datele de montaj salvate vor fi șterse. Confirmă doar dacă vrei să elimini
            montajul.
          </InlineAlert>
          <Button
            variant="ghost"
            disabled={saveState === "pending"}
            onClick={() => {
              setConfirmingDelete(false);
              setSaveError(null);
            }}
          >
            Anulează
          </Button>
          <Button
            disabled={saveState === "pending"}
            onClick={() =>
              void applyOffer({
                optionalScopeIds: [],
                confirmDeleteInstallationFacts: true,
              })
            }
          >
            Șterge datele și elimină montajul
          </Button>
        </>
      ) : null}
      {saveError ? (
        <InlineAlert tone="error" title="Montajul nu a putut fi actualizat">
          {saveError}
        </InlineAlert>
      ) : null}
    </div>
  );
}

function RequestInstallationFactsReadout({
  facts,
}: {
  facts: RequestInstallationFactsTransport | null;
}) {
  return (
    <>
      <p className="ui-note">Datele de montaj nu mai pot fi editate.</p>
      <dl className="fact-grid">
        <InfoRow label="Locație" value={facts?.siteName || "—"} />
        <InfoRow
          label="Adresă"
          value={[facts?.street, facts?.city, facts?.county, facts?.postalCode]
            .filter(Boolean)
            .join(", ") || "—"}
        />
        <InfoRow label="Contact" value={facts?.contactName || "—"} />
        <InfoRow label="Telefon" value={facts?.contactPhone || "—"} />
        <InfoRow
          label="Măsurători"
          value={presentMeasurementStatusLabel(facts?.measurementStatus ?? "")}
        />
        <InfoRow
          label="Fațadă"
          value={presentFacadeTypeLabel(facts?.facadeType ?? "")}
        />
        <InfoRow
          label="Prindere"
          value={presentFixingMethodLabel(facts?.fixingMethod ?? "")}
        />
        <InfoRow
          label="Racord electric"
          value={presentElectricalStateLabel(facts?.siteElectrical ?? "")}
        />
      </dl>
    </>
  );
}

function RequestInstallationFactsEditor({
  detail,
  facts,
}: {
  detail: RequestDetailTransport;
  facts: RequestInstallationFactsTransport | null;
}) {
  const [draft, setDraft] = useState<FactsDraft>(() => draftFromFacts(facts));
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  async function save(): Promise<void> {
    const width = readOptionalNumber(draft.mountingSurfaceWidthMm);
    const height = readOptionalNumber(draft.mountingSurfaceHeightMm);
    const elevation = readOptionalNumber(draft.installationElevationMm);
    const crewSize = readOptionalNumber(draft.crewSize);
    const plannedDurationHours = readOptionalNumber(draft.plannedDurationHours);
    if (
      [width, height, elevation, crewSize, plannedDurationHours].some((value) =>
        Number.isNaN(value),
      )
    ) {
      setSaveState("error");
      setSaveError("Valorile numerice nu sunt valide.");
      return;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentRequestDetail(
        await patchRequestInstallationFacts(detail.requestId, {
          expectedVersion: facts?.version ?? 0,
          siteName: draft.siteName.trim() || null,
          street: draft.street,
          city: draft.city,
          county: draft.county.trim() || null,
          postalCode: draft.postalCode.trim() || null,
          contactName: draft.contactName.trim() || null,
          contactPhone: draft.contactPhone.trim() || null,
          accessNotes: draft.accessNotes.trim() || null,
          measurementStatus: draft.measurementStatus,
          mountingSurfaceWidthMm: width,
          mountingSurfaceHeightMm: height,
          installationElevationMm: elevation,
          facadeType: draft.facadeType,
          fixingMethod: draft.fixingMethod,
          siteElectrical: draft.siteElectrical,
          crewSize,
          plannedDurationHours,
        }),
      );
      if (presented) {
        writeResource(resourceKeys.request(detail.requestId), presented);
      }
      invalidateResources(resourceKeys.requests());
      setSaveState("idle");
    } catch (error) {
      setSaveState("error");
      const code = error instanceof TransportError ? readTransportErrorCode(error.body) : null;
      setSaveError(
        code === "installation_facts_locked"
          ? "Datele de montaj nu mai pot fi editate."
          : "Datele de montaj nu au putut fi salvate.",
      );
    }
  }

  return (
    <div className="stack">
      <TextField
        id="install-site-name"
        label="Locație"
        value={draft.siteName}
        onChange={(value) => setDraft((current) => ({ ...current, siteName: value }))}
      />
      <TextField
        id="install-street"
        label="Stradă"
        value={draft.street}
        onChange={(value) => setDraft((current) => ({ ...current, street: value }))}
      />
      <TextField
        id="install-city"
        label="Localitate"
        value={draft.city}
        onChange={(value) => setDraft((current) => ({ ...current, city: value }))}
      />
      <TextField
        id="install-county"
        label="Județ"
        value={draft.county}
        onChange={(value) => setDraft((current) => ({ ...current, county: value }))}
      />
      <TextField
        id="install-postal"
        label="Cod poștal"
        value={draft.postalCode}
        onChange={(value) => setDraft((current) => ({ ...current, postalCode: value }))}
      />
      <TextField
        id="install-contact"
        label="Contact"
        value={draft.contactName}
        onChange={(value) => setDraft((current) => ({ ...current, contactName: value }))}
      />
      <TextField
        id="install-phone"
        label="Telefon"
        value={draft.contactPhone}
        onChange={(value) => setDraft((current) => ({ ...current, contactPhone: value }))}
      />
      <TextField
        id="install-access"
        label="Note de acces"
        value={draft.accessNotes}
        onChange={(value) => setDraft((current) => ({ ...current, accessNotes: value }))}
      />
      <SelectField
        id="install-measurement"
        label="Măsurători"
        value={draft.measurementStatus}
        options={MEASUREMENT_STATUS_OPTIONS}
        onChange={(value) =>
          setDraft((current) => ({ ...current, measurementStatus: value }))
        }
      />
      <TextField
        id="install-width"
        label="Lățime suprafață (mm)"
        inputMode="decimal"
        value={draft.mountingSurfaceWidthMm}
        onChange={(value) =>
          setDraft((current) => ({ ...current, mountingSurfaceWidthMm: value }))
        }
      />
      <TextField
        id="install-height"
        label="Înălțime suprafață (mm)"
        inputMode="decimal"
        value={draft.mountingSurfaceHeightMm}
        onChange={(value) =>
          setDraft((current) => ({ ...current, mountingSurfaceHeightMm: value }))
        }
      />
      <TextField
        id="install-elevation"
        label="Înălțime montaj (mm)"
        inputMode="decimal"
        value={draft.installationElevationMm}
        onChange={(value) =>
          setDraft((current) => ({ ...current, installationElevationMm: value }))
        }
      />
      <SelectField
        id="install-facade"
        label="Fațadă"
        value={draft.facadeType}
        options={FACADE_TYPE_OPTIONS}
        onChange={(value) => setDraft((current) => ({ ...current, facadeType: value }))}
      />
      <SelectField
        id="install-fixing"
        label="Prindere"
        value={draft.fixingMethod}
        options={FIXING_METHOD_OPTIONS}
        onChange={(value) => setDraft((current) => ({ ...current, fixingMethod: value }))}
      />
      <SelectField
        id="install-electrical"
        label="Racord electric"
        value={draft.siteElectrical}
        options={ELECTRICAL_STATE_OPTIONS}
        onChange={(value) => setDraft((current) => ({ ...current, siteElectrical: value }))}
      />
      <TextField
        id="install-crew"
        label="Echipă"
        inputMode="decimal"
        value={draft.crewSize}
        onChange={(value) => setDraft((current) => ({ ...current, crewSize: value }))}
      />
      <TextField
        id="install-duration"
        label="Durată planificată (ore)"
        inputMode="decimal"
        value={draft.plannedDurationHours}
        onChange={(value) =>
          setDraft((current) => ({ ...current, plannedDurationHours: value }))
        }
      />
      <Button disabled={saveState === "pending"} onClick={() => void save()}>
        Salvează datele de montaj
      </Button>
      {saveError ? (
        <InlineAlert tone="error" title="Montajul nu a putut fi actualizat">
          {saveError}
        </InlineAlert>
      ) : null}
    </div>
  );
}

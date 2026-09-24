import { useState } from "react";
import {
  OPERATIONAL_SERVICE_MODE_OPTIONS,
  presentOperationalServices,
} from "../adapters/operationalServicesAdapter";
import { patchOperationalService } from "../api/operationalServices";
import { Button } from "../components/Button";
import { CollectionRail } from "../components/CollectionRail";
import { InfoRow } from "../components/InfoRow";
import { InlineAlert } from "../components/InlineAlert";
import { SelectField } from "../components/SelectField";
import { SurfacePanel } from "../components/SurfacePanel";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadOperationalServicesAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { administrationRailItems } from "../layout/administrationNav";
import { SlicePage } from "../layout/SlicePage";

export function OperationalServicesAdminPage() {
  const resource = useResource(resourceKeys.operationalServicesAdmin(), () =>
    loadOperationalServicesAdmin(),
  );
  const model = resource.data;
  const installation = model?.capabilities.find((item) => item.capabilityId === "SITE_INSTALLATION");
  const [draftMode, setDraftMode] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const selectedMode = draftMode ?? installation?.offerMode ?? "SERVICE_DISABLED";

  async function save(): Promise<void> {
    if (!installation) {
      return;
    }
    setSaveState("pending");
    setSaveError(null);
    try {
      const presented = presentOperationalServices(
        await patchOperationalService(installation.capabilityId, selectedMode || "SERVICE_DISABLED"),
      );
      if (presented) {
        writeResource(resourceKeys.operationalServicesAdmin(), presented);
      }
      setDraftMode(null);
      setSaveState("idle");
    } catch {
      setSaveState("error");
      setSaveError("Modul de montaj nu a putut fi salvat.");
    }
  }

  return (
    <SlicePage
      contextLabel="Administrare"
      currentHref="/admin/services"
      workspace="admin"
      eyebrow="Administrare"
      title="Servicii operaționale"
      lead="Modul în care organizația oferă montajul la locație pentru lucrările noi."
    >
      <CollectionRail label="Administrare" items={administrationRailItems("services")} />
      {resource.status === "error" && !model ? (
        <InlineAlert tone="error" title="Serviciile nu au putut fi citite">
          Configurația de servicii nu este disponibilă.
        </InlineAlert>
      ) : null}
      <SurfacePanel title="Montaj la locație" label="Montaj la locație" busy={!model && resource.status !== "error"}>
        {installation ? (
          <div className="stack">
            <dl className="fact-grid">
              <InfoRow label="Mod curent" value={installation.offerModeLabel} />
            </dl>
            {model?.canWrite && installation.selectable ? (
              <>
                <SelectField
                  id="site-install-offer-mode"
                  label="Mod serviciu"
                  value={selectedMode}
                  options={OPERATIONAL_SERVICE_MODE_OPTIONS.map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                  onChange={setDraftMode}
                />
                <Button disabled={saveState === "pending"} onClick={() => void save()}>
                  Salvează modul
                </Button>
              </>
            ) : (
              <p className="ui-note">Modul de serviciu este doar pentru citire.</p>
            )}
            {saveError ? (
              <InlineAlert tone="error" title="Salvarea a eșuat">
                {saveError}
              </InlineAlert>
            ) : null}
          </div>
        ) : null}
      </SurfacePanel>
    </SlicePage>
  );
}

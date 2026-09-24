import { InfoRow } from "../components/InfoRow";
import { SurfacePanel } from "../components/SurfacePanel";
import type { SiteInstallationOperationalTransport } from "../api/types";

type SiteInstallationContextPanelProps = {
  context: SiteInstallationOperationalTransport;
};

export function SiteInstallationContextPanel({
  context,
}: SiteInstallationContextPanelProps) {
  const dimensions =
    context.mountingSurfaceWidthMm == null && context.mountingSurfaceHeightMm == null
      ? null
      : `${context.mountingSurfaceWidthMm ?? "—"} × ${context.mountingSurfaceHeightMm ?? "—"} mm`;
  return (
    <SurfacePanel title="Montaj la locație" label="Montaj la locație">
      <dl className="fact-grid">
        <InfoRow label="Mod" value={context.providerModeLabel} />
        <InfoRow label="Locație" value={context.siteName || "—"} />
        <InfoRow label="Adresă" value={`${context.street}, ${context.city}`} />
        <InfoRow label="Suport" value={context.surfaceTypeLabel} />
        {context.surfaceOtherNote ? (
          <InfoRow label="Tip suprafață — detalii" value={context.surfaceOtherNote} />
        ) : null}
        {dimensions ? <InfoRow label="Dimensiuni" value={dimensions} /> : null}
        <InfoRow label="Fixare" value={context.fixingMethodLabel} />
        {context.fixingOtherNote ? (
          <InfoRow label="Metodă de fixare — detalii" value={context.fixingOtherNote} />
        ) : null}
        <InfoRow
          label="Înălțime"
          value={
            context.installationElevationMm == null
              ? "—"
              : `${context.installationElevationMm} mm`
          }
        />
        <InfoRow label="Electric" value={context.siteElectricalLabel} />
        {context.accessNotes ? <InfoRow label="Acces" value={context.accessNotes} /> : null}
        {context.contactName ? <InfoRow label="Contact" value={context.contactName} /> : null}
        {context.contactPhone ? <InfoRow label="Telefon" value={context.contactPhone} /> : null}
        {context.crewSize != null ? (
          <InfoRow label="Echipă" value={String(context.crewSize)} />
        ) : null}
        {context.plannedDurationHours != null ? (
          <InfoRow label="Durată" value={`${context.plannedDurationHours} h`} />
        ) : null}
      </dl>
    </SurfacePanel>
  );
}

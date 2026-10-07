import { LoadingFloor } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
import { PageMetrics } from "../components/PageMetrics";
import type { AppRoute } from "../routing/appRoute";
import { loadingFloorVariantFor, presentRouteChrome } from "./routeChrome";
import { SlicePage } from "./SlicePage";

type RouteLoadingPageProps = {
  route: AppRoute;
};

export function RouteLoadingPage({ route }: RouteLoadingPageProps) {
  const chrome = presentRouteChrome(route);
  const floor = loadingFloorVariantFor(chrome.workspace);

  return (
    <SlicePage
      contextLabel={chrome.contextLabel}
      currentHref={chrome.currentHref}
      workspace={chrome.workspace}
      surface={chrome.surface ?? chrome.pilot?.surface}
      headerVariant={chrome.pilot ? "pilot" : "default"}
      eyebrow={chrome.eyebrow}
      title={chrome.title}
      lead={chrome.lead}
      instrument={chrome.pilot?.metrics ? <PageMetrics items={chrome.pilot.metrics.map((label) => ({ label, value: "—" }))} /> : null}
    >
      <SurfacePanel variant="flush" label={chrome.title} busy>
        <LoadingFloor
          variant={floor}
          label="Se încarcă pagina."
        />
      </SurfacePanel>
    </SlicePage>
  );
}

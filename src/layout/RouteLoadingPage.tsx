import { LoadingFloor } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
import type { AppRoute } from "../routing/appRoute";
import { loadingFloorForRoute } from "./pageLayout";
import { presentRouteChrome } from "./routeChrome";
import { SlicePage } from "./SlicePage";

type RouteLoadingPageProps = {
  route: AppRoute;
};

export function RouteLoadingPage({ route }: RouteLoadingPageProps) {
  const chrome = presentRouteChrome(route);
  const floor = loadingFloorForRoute(route.name);

  return (
    <SlicePage
      contextLabel={chrome.contextLabel}
      currentHref={chrome.currentHref}
      layout={chrome.layout}
      variant={chrome.variant}
      eyebrow={chrome.eyebrow}
      title={chrome.title}
      lead={chrome.lead}
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

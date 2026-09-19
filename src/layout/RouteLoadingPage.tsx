import { LoadingFloor } from "../components/LoadingFloor";
import { SurfacePanel } from "../components/SurfacePanel";
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
      eyebrow={chrome.eyebrow}
      title={chrome.title}
      lead={chrome.lead}
    >
      <SurfacePanel variant="flush" label={chrome.title} busy>
        <LoadingFloor
          variant={floor}
          label="Se verifică contractul API."
        />
      </SurfacePanel>
    </SlicePage>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import type { HealthPresentation } from "./adapters/healthAdapter";
import { loadResource } from "./data/resourceCache";
import { resourceKeys } from "./data/resourceKeys";
import { loadHealthPresentation } from "./data/routeLoaders";
import type { AccountAreaProps } from "./layout/AccountArea";
import { AppShell } from "./layout/AppShell";
import { PageHeader } from "./layout/PageHeader";
import { PageRegion } from "./layout/PageRegion";
import { RouteLoadingPage } from "./layout/RouteLoadingPage";
import { presentRouteChrome } from "./layout/routeChrome";
import {
  canonicalLocation,
  parseAppRoute,
  parseJobContext,
  parseSpineContext,
  parseTaskContext,
  type AppRoute,
} from "./routing/appRoute";
import {
  navigate,
  readAppLocation,
  sameOriginNavigation,
  type AppLocation,
} from "./routing/navigate";
import { intendedReturnPath, resolveCloudAuthGate } from "./session/cloudAuth";
import { CloudSessionProvider, useCloudSession } from "./session/CloudSessionContext";
import { configuratorContextKey } from "./session/configuratorSession";
import { AtelierPage } from "./surfaces/AtelierPage";
import { AuthGatePage } from "./surfaces/AuthGatePage";
import { CatalogPage } from "./surfaces/CatalogPage";
import { ClientDetailPage } from "./surfaces/ClientDetailPage";
import { ClientsPage } from "./surfaces/ClientsPage";
import { ConfiguratorPage } from "./surfaces/ConfiguratorPage";
import { ExecutionPage } from "./surfaces/ExecutionPage";
import { FailClosedPage } from "./surfaces/FailClosedPage";
import { FoundationProofPage } from "./surfaces/FoundationProofPage";
import { JobDetailPage } from "./surfaces/JobDetailPage";
import { JobsPage } from "./surfaces/JobsPage";
import { QuoteSnapshotPage } from "./surfaces/QuoteSnapshotPage";
import { QuotesPage } from "./surfaces/QuotesPage";
import { RequestDetailPage } from "./surfaces/RequestDetailPage";
import { RequestsPage } from "./surfaces/RequestsPage";
import { ResourcesAdminPage } from "./surfaces/ResourcesAdminPage";

function syncCanonicalLocation(): AppLocation {
  const next = canonicalLocation(window.location.pathname, window.location.search);
  if (next) {
    window.history.replaceState({}, "", next);
  }
  return readAppLocation();
}

function operatorContext(route: AppRoute): string {
  return presentRouteChrome(route).contextLabel;
}

function renderRoute(route: AppRoute, search: string): ReactNode {
  switch (route.name) {
    case "clients":
      return <ClientsPage />;
    case "client":
      return <ClientDetailPage customerId={route.customerId} />;
    case "requests":
      return <RequestsPage />;
    case "request":
      return <RequestDetailPage requestId={route.requestId} />;
    case "catalog":
      return <CatalogPage />;
    case "configurator": {
      const context = parseSpineContext(search);
      return (
        <ConfiguratorPage
          key={configuratorContextKey(context)}
          customerId={context.customerId}
          requestId={context.requestId}
          productCode={context.productCode}
        />
      );
    }
    case "quotes":
      return <QuotesPage />;
    case "quote":
      return (
        <QuoteSnapshotPage
          productCode={route.productCode}
          quoteSnapshotId={route.quoteSnapshotId}
        />
      );
    case "jobs":
      return <JobsPage />;
    case "job":
      return <JobDetailPage jobId={route.jobId} />;
    case "atelier":
      return <AtelierPage jobId={parseJobContext(search)} />;
    case "execution":
      return (
        <ExecutionPage
          planId={route.planId}
          taskId={parseTaskContext(search)}
          jobId={parseJobContext(search)}
        />
      );
    case "admin-resources":
      return <ResourcesAdminPage />;
    case "foundation":
      return <FoundationProofPage />;
    case "unknown":
      return (
        <PageRegion>
          <PageHeader
            title="Pagină inexistentă"
            lead="Această adresă nu există în aplicație."
          />
          <div className="page-region">
            <a href="/clienti">Înapoi la clienți</a>
          </div>
        </PageRegion>
      );
    default: {
      const exhaustive: never = route;
      return exhaustive;
    }
  }
}

function presentAccount(cloud: ReturnType<typeof useCloudSession>): AccountAreaProps | null {
  if (cloud.mode !== "cloud" || !cloud.user || !cloud.organization) {
    return null;
  }
  return {
    organizationName: cloud.organization.displayName,
    userLabel: cloud.user.email,
    memberships: cloud.memberships,
    currentOrganizationId: cloud.organization.organizationId,
    onSwitchOrganization: (organizationId) => cloud.switchOrganization(organizationId),
    onLogout: () => cloud.logout(),
  };
}

export function App() {
  return (
    <CloudSessionProvider>
      <AppRuntime />
    </CloudSessionProvider>
  );
}

function AppRuntime() {
  const cloud = useCloudSession();
  const [location, setLocation] = useState(syncCanonicalLocation);

  useEffect(() => {
    function onPop(): void {
      setLocation(syncCanonicalLocation());
    }
    function onClick(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }
      const href = sameOriginNavigation(anchor, event);
      if (href === null) {
        return;
      }
      event.preventDefault();
      navigate(href);
    }
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const gate = resolveCloudAuthGate(cloud);
  if (gate !== "authenticated") {
    return (
      <AuthGatePage
        kind={gate}
        returnPath={intendedReturnPath(location.pathname, location.search)}
      />
    );
  }

  return <AuthenticatedApp location={location} account={presentAccount(cloud)} />;
}

function AuthenticatedApp({
  location,
  account,
}: {
  location: AppLocation;
  account: AccountAreaProps | null;
}) {
  const [health, setHealth] = useState<HealthPresentation | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    void loadResource(resourceKeys.health(), loadHealthPresentation).then((presented) => {
      if (!cancelled) {
        setHealth(presented);
        setLoadState("ready");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const route = parseAppRoute(location.pathname);
  if (route.name === "foundation") {
    return <FoundationProofPage />;
  }

  if (loadState === "ready" && (!health || health.kind === "incompatible")) {
    return (
      <FailClosedPage
        reason={
          health?.kind === "incompatible"
            ? health.reason
            : "Contractul API nu a putut fi verificat."
        }
      />
    );
  }

  return (
    <AppShell
      contextLabel={operatorContext(route)}
      mode="slice"
      currentHref={location.pathname}
      account={account}
    >
      {loadState === "loading" ? (
        <RouteLoadingPage route={route} />
      ) : (
        renderRoute(route, location.search)
      )}
    </AppShell>
  );
}

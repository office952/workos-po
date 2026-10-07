import { useEffect, useState, type ReactNode } from "react";
import type { HealthPresentation } from "./adapters/healthAdapter";
import { loadResource } from "./data/resourceCache";
import { resourceKeys } from "./data/resourceKeys";
import { loadHealthPresentation } from "./data/routeLoaders";
import type { AccountAreaProps } from "./layout/AccountArea";
import { AppShell } from "./layout/AppShell";
import { PageRegion } from "./layout/PageRegion";
import { StateNotice } from "./components/StateNotice";
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
import {
  isAuthEntryPath,
  resolveCloudAuthGate,
  resolvePostAuthenticationPath,
} from "./session/cloudAuth";
import { CloudSessionProvider, useCloudSession } from "./session/CloudSessionContext";
import { cloudSessionScope } from "./session/cloudSessionScope";
import { configuratorContextKey } from "./session/configuratorSession";
import { AtelierPage } from "./surfaces/AtelierPage";
import { AuthGatePage } from "./surfaces/AuthGatePage";
import { CatalogPage } from "./surfaces/CatalogPage";
import { AssemblyPage } from "./surfaces/AssemblyPage";
import { ClientDetailPage } from "./surfaces/ClientDetailPage";
import { ClientsPage } from "./surfaces/ClientsPage";
import { ConfiguratorPage, readAssemblyMemberRole } from "./surfaces/ConfiguratorPage";
import { ExecutionPage } from "./surfaces/ExecutionPage";
import { FailClosedPage } from "./surfaces/FailClosedPage";
import { FoundationProofPage } from "./surfaces/FoundationProofPage";
import { JobDetailPage } from "./surfaces/JobDetailPage";
import { JobsPage } from "./surfaces/JobsPage";
import { PlanningPage } from "./surfaces/PlanningPage";
import { QuoteSnapshotPage } from "./surfaces/QuoteSnapshotPage";
import { QuotesPage } from "./surfaces/QuotesPage";
import { RequestDetailPage } from "./surfaces/RequestDetailPage";
import { RequestsPage } from "./surfaces/RequestsPage";
import { NewRequestPage } from "./surfaces/NewRequestPage";
import { CommercialAdminPage } from "./surfaces/CommercialAdminPage";
import { ResourcesAdminPage } from "./surfaces/ResourcesAdminPage";
import { ExternalProductionAdminPage } from "./surfaces/ExternalProductionAdminPage";
import { MaterialReadinessAdminPage } from "./surfaces/MaterialReadinessAdminPage";
import { OperationalServicesAdminPage } from "./surfaces/OperationalServicesAdminPage";
import { FormulasAdminPage } from "./surfaces/FormulasAdminPage";
import { TechnicalAdminPage } from "./surfaces/TechnicalAdminPage";
import { PeopleAdminPage } from "./surfaces/PeopleAdminPage";
import { WorkcentersAdminPage } from "./surfaces/WorkcentersAdminPage";
import { ProductEnablementAdminPage } from "./surfaces/ProductEnablementAdminPage";
import { AccessAdminPage } from "./surfaces/AccessAdminPage";
import { AdminHomePage } from "./surfaces/AdminHomePage";
import { LaunchpadPage } from "./surfaces/LaunchpadPage";
import { ThemeSync } from "./theme/ThemeControl";

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
    case "home":
      return <LaunchpadPage />;
    case "clients":
      return <ClientsPage />;
    case "client":
      return <ClientDetailPage customerId={route.customerId} />;
    case "requests":
      return <RequestsPage />;
    case "new-request":
      return <NewRequestPage key={search} />;
    case "request":
      return <RequestDetailPage requestId={route.requestId} />;
    case "catalog":
      return <CatalogPage />;
    case "assembly":
      return <AssemblyPage />;
    case "configurator": {
      const context = parseSpineContext(search);
      const assemblyId = new URLSearchParams(search).get("assembly");
      const memberRole = new URLSearchParams(search).get("role");
      return (
        <ConfiguratorPage
          key={configuratorContextKey({ ...context, assemblyId })}
          customerId={context.customerId}
          requestId={context.requestId}
          productCode={context.productCode}
          assemblyId={assemblyId}
          memberRole={readAssemblyMemberRole(memberRole)}
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
    case "planning":
      return <PlanningPage />;
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
    case "admin":
      return <AdminHomePage />;
    case "admin-resources":
      return <ResourcesAdminPage />;
    case "admin-services":
      return <OperationalServicesAdminPage />;
    case "admin-material-readiness":
      return <MaterialReadinessAdminPage />;
    case "admin-external-production":
      return <ExternalProductionAdminPage />;
    case "admin-commercial":
      return <CommercialAdminPage />;
    case "admin-technical":
      return <TechnicalAdminPage />;
    case "admin-formulas":
      return <FormulasAdminPage />;
    case "admin-products":
      return <ProductEnablementAdminPage />;
    case "admin-access":
      return <AccessAdminPage />;
    case "admin-people":
      return <PeopleAdminPage />;
    case "admin-person":
      return <PeopleAdminPage personId={route.personId} />;
    case "admin-workcenters":
      return <WorkcentersAdminPage />;
    case "admin-workcenter":
      return <WorkcentersAdminPage workcenterId={route.workcenterId} />;
    case "admin-machine":
      return (
        <WorkcentersAdminPage
          workcenterId={route.workcenterId}
          machineId={route.machineId}
        />
      );
    case "foundation":
      return <FoundationProofPage />;
    case "unknown":
      return (
        <PageRegion>
          <StateNotice
            kind="empty"
            title="Pagină inexistentă"
            reason="Această adresă nu există în aplicație."
            action={<a className="text-link" href="/">Înapoi la pagina principală</a>}
          />
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
    membershipRole: cloud.organization.membershipRole,
    memberships: cloud.memberships,
    currentOrganizationId: cloud.organization.organizationId,
    onSwitchOrganization: (organizationId) => cloud.switchOrganization(organizationId),
    onLogout: () => cloud.logout(),
  };
}

export function App() {
  return (
    <CloudSessionProvider>
      <ThemeSync />
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

  useEffect(() => {
    if (gate !== "authenticated") {
      return;
    }
    const landing = resolvePostAuthenticationPath(location.pathname, location.search);
    const current = `${location.pathname}${location.search}`;
    if (landing !== current) {
      navigate(landing, "replace");
    }
  }, [gate, location.pathname, location.search]);

  if (gate !== "authenticated") {
    return (
      <AuthGatePage
        kind={gate}
        returnPath={resolvePostAuthenticationPath(location.pathname, location.search)}
      />
    );
  }

  if (isAuthEntryPath(location.pathname)) {
    return (
      <AppShell
        contextLabel="WorkOS"
        mode="slice"
        currentHref="/"
        account={presentAccount(cloud)}
      >
        <RouteLoadingPage route={{ name: "home" }} />
      </AppShell>
    );
  }

  return <AuthenticatedApp key={cloudSessionScope(cloud)} location={location} account={presentAccount(cloud)} />;
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

  const incompatible = loadState === "ready" && (!health || health.kind === "incompatible");

  return (
    <AppShell
      contextLabel={operatorContext(route)}
      mode="slice"
      currentHref={location.pathname}
      account={account}
    >
      {loadState === "loading" ? (
        <RouteLoadingPage route={route} />
      ) : incompatible ? (
        <FailClosedPage />
      ) : (
        renderRoute(route, location.search)
      )}
    </AppShell>
  );
}

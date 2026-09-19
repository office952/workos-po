import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchCloudSession,
  loginCloud,
  logoutCloud,
  switchCloudOrganization,
} from "../api/cloudSession";
import type {
  CloudLoginPresentation,
  CloudSessionPresentation,
} from "../adapters/cloudSessionAdapter";
import { invalidateAfterCloudBoundaryChange } from "../data/invalidation";
import {
  clearCloudAuthenticatedMark,
  consumeCloudSessionExpiredMark,
  rememberCloudAuthenticated,
} from "./cloudAuth";
import { clearConfiguratorSession } from "./configuratorSession";
import {
  restoreCloudUnauthorizedExpiry,
  setCloudUnauthorizedHandler,
  suppressCloudUnauthorizedExpiry,
} from "./sessionExpiryBridge";

const emptySession: CloudSessionPresentation = {
  mode: "single_plane",
  authConfigured: true,
  user: null,
  organization: null,
  memberships: [],
};

type CloudSessionState = CloudSessionPresentation & {
  ready: boolean;
  unavailable: boolean;
  sessionExpired: boolean;
  login: (
    email: string,
    password: string,
    organizationId?: string,
  ) => Promise<CloudLoginPresentation>;
  logout: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<CloudLoginPresentation>;
  refresh: () => Promise<void>;
};

const CloudSessionContext = createContext<CloudSessionState | null>(null);

function forgetOrganizationBoundState(): void {
  clearConfiguratorSession();
  invalidateAfterCloudBoundaryChange();
}

export function CloudSessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [session, setSession] = useState<CloudSessionPresentation>(emptySession);

  const applySession = useCallback((current: CloudSessionPresentation) => {
    setSession(current);
    if (current.user && current.organization) {
      restoreCloudUnauthorizedExpiry();
      rememberCloudAuthenticated();
      setSessionExpired(false);
    }
  }, []);

  const markSessionExpired = useCallback(() => {
    setSessionExpired(true);
    setSession((current) => ({
      ...current,
      user: null,
      organization: null,
    }));
  }, []);

  const refresh = useCallback(async () => {
    const current = await fetchCloudSession();
    applySession(current);
    if (
      current.mode === "cloud" &&
      (!current.user || !current.organization) &&
      consumeCloudSessionExpiredMark()
    ) {
      setSessionExpired(true);
    }
    setUnavailable(false);
    setReady(true);
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    void fetchCloudSession()
      .then((current) => {
        if (cancelled) {
          return;
        }
        applySession(current);
        if (
          current.mode === "cloud" &&
          (!current.user || !current.organization) &&
          consumeCloudSessionExpiredMark()
        ) {
          setSessionExpired(true);
        }
        setUnavailable(false);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    setCloudUnauthorizedHandler(() => {
      markSessionExpired();
    });
    return () => {
      setCloudUnauthorizedHandler(null);
    };
  }, [markSessionExpired]);

  const login = useCallback(
    async (email: string, password: string, organizationId?: string) => {
      const result = await loginCloud(email, password, organizationId);
      if (result.ok) {
        applySession(result.session);
        setUnavailable(false);
        setSessionExpired(false);
      }
      return result;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    suppressCloudUnauthorizedExpiry();
    setSessionExpired(false);
    try {
      await logoutCloud();
    } catch {
      restoreCloudUnauthorizedExpiry();
      throw new Error("cloud_logout_failed");
    }
    clearCloudAuthenticatedMark();
    forgetOrganizationBoundState();
    const current = await fetchCloudSession().catch(() => emptySession);
    setSession(current);
  }, []);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const result = await switchCloudOrganization(organizationId);
      if (result.ok) {
        forgetOrganizationBoundState();
        applySession(result.session);
      }
      return result;
    },
    [applySession],
  );

  const value = useMemo(
    () => ({
      ...session,
      ready,
      unavailable,
      sessionExpired,
      login,
      logout,
      switchOrganization,
      refresh,
    }),
    [session, ready, unavailable, sessionExpired, login, logout, switchOrganization, refresh],
  );

  return <CloudSessionContext.Provider value={value}>{children}</CloudSessionContext.Provider>;
}

export function useCloudSession(): CloudSessionState {
  const value = useContext(CloudSessionContext);
  if (!value) {
    throw new Error("CloudSessionProvider missing");
  }
  return value;
}

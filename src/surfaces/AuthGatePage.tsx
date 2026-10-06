import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { CloudMembershipPresentation } from "../adapters/cloudSessionAdapter";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { navigate } from "../routing/navigate";
import {
  loginErrorLabel,
  resolvePostAuthenticationPath,
  type CloudAuthGateKind,
} from "../session/cloudAuth";
import { useCloudSession } from "../session/CloudSessionContext";
import {
  COLOR_SCHEME_EVENT,
  readColorSchemePreference,
  resolveColorScheme,
  writeColorSchemePreference,
} from "../theme/colorScheme";
import {
  AuthTechnicalFrame,
  type AuthAccessMode,
} from "./AuthTechnicalFrame";
import { SignLightDemo } from "./SignLightDemo";

type AuthGatePageProps = {
  kind: CloudAuthGateKind;
  returnPath?: string;
};

export function AuthGatePage({ kind, returnPath = "/" }: AuthGatePageProps) {
  const { login, refresh, sessionExpired } = useCloudSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<CloudMembershipPresentation[] | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [power, setPower] = useState(() => {
    const preference = readColorSchemePreference();
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return resolveColorScheme(preference, prefersDark) === "dark";
  });
  const [accessMode, setAccessMode] = useState<AuthAccessMode>("idle");
  const [layoutFamily, setLayoutFamily] = useState<"desktop" | "compact" | "phone">("desktop");
  const [sceneFit, setSceneFit] = useState<"scaled" | "reflow">("scaled");
  const [detailTier, setDetailTier] = useState<"full" | "high" | "medium" | "low" | "essential">("full");
  const [sceneScale, setSceneScale] = useState(1);
  const expiredNotice = kind === "session_expired" || sessionExpired;
  const scene = power ? "night" : "day";
  const resolvedAccess: AuthAccessMode =
    kind === "session_expired" && accessMode === "idle" ? "societate" : accessMode;

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width < 480) {
        setLayoutFamily("phone");
        setSceneFit("reflow");
        setDetailTier("essential");
        setSceneScale(1);
        return;
      }
      if (width < 768) {
        setLayoutFamily("phone");
        setSceneFit("reflow");
        setDetailTier("low");
        setSceneScale(1);
        return;
      }
      if (width < 1152) {
        setLayoutFamily("compact");
        setSceneFit("reflow");
        setDetailTier("medium");
        setSceneScale(1);
        return;
      }
      const widthScale = width / 1440;
      const heightScale = (height - 84) / 816;
      const nextScale = Math.min(Math.max(Math.min(widthScale, heightScale), 0.72), 1.5);
      setLayoutFamily("desktop");
      setSceneFit("scaled");
      setDetailTier(width >= 1440 ? "full" : "high");
      setSceneScale(nextScale);
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => {
      window.removeEventListener("resize", updateLayout);
    };
  }, []);

  useEffect(() => {
    const syncPowerFromPreference = () => {
      const preference = readColorSchemePreference();
      const prefersDark =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setPower(resolveColorScheme(preference, prefersDark) === "dark");
    };
    window.addEventListener(COLOR_SCHEME_EVENT, syncPowerFromPreference);
    return () => {
      window.removeEventListener(COLOR_SCHEME_EVENT, syncPowerFromPreference);
    };
  }, []);

  function setPresentationPower(nextPower: boolean): void {
    setPower(nextPower);
    writeColorSchemePreference(nextPower ? "dark" : "light");
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password, choices ? organizationId : undefined);
      if (result.ok) {
        setPassword("");
        setChoices(null);
        const landing = resolvePostAuthenticationPath(
          window.location.pathname,
          window.location.search,
        );
        const current = `${window.location.pathname}${window.location.search}`;
        if (landing !== current) {
          navigate(landing, "replace");
        }
        return;
      }
      if (result.error === "organization_selection_required" && result.memberships.length > 0) {
        setChoices(result.memberships);
        setOrganizationId(result.memberships[0]?.organizationId ?? "");
        setError("Alege organizația pentru acest cont.");
        return;
      }
      setError(loginErrorLabel(result.error));
    } catch {
      setError("Conexiunea s-a întrerupt. Reîncearcă.");
    } finally {
      setBusy(false);
    }
  }

  function openAccess(mode: Exclude<AuthAccessMode, "idle">): void {
    setAccessMode(mode);
    setError(null);
  }

  function closeAccess(): void {
    if (kind === "session_expired") {
      return;
    }
    setAccessMode("idle");
    setError(null);
    setChoices(null);
  }

  return (
    <div
      className="auth-gate"
      data-floorplan="authentication"
      data-scene={scene}
      data-access={resolvedAccess}
      data-layout={layoutFamily}
      data-scene-fit={sceneFit}
      data-detail={detailTier}
      style={{ "--login-stage-scale": sceneScale } as CSSProperties}
    >
      <a className="skip-link" href="#autentificare">
        Sari la autentificare
      </a>
      <header className="auth-gate__brand">
        <span className="app-shell__brand">
          <BrandMark />
          <span className="app-shell__wordmark">WorkOS</span>
        </span>
        <div className="auth-gate__login-choices" role="group" aria-label="Tip autentificare">
          <Button
            type="button"
            variant={resolvedAccess === "angajat" ? "primary" : "secondary"}
            aria-pressed={resolvedAccess === "angajat"}
            onClick={() => resolvedAccess === "angajat" ? closeAccess() : openAccess("angajat")}
          >
            Login Angajat
          </Button>
          <Button
            type="button"
            variant={resolvedAccess === "societate" ? "primary" : "secondary"}
            aria-pressed={resolvedAccess === "societate"}
            onClick={() => resolvedAccess === "societate" ? closeAccess() : openAccess("societate")}
          >
            Login Societate
          </Button>
        </div>
      </header>
      <main id="autentificare" className="auth-gate__main" tabIndex={-1}>
        <div className="auth-gate__stage">
        <SignLightDemo
          power={power}
          onPowerChange={setPresentationPower}
          accessMode={resolvedAccess}
        />
        <AuthTechnicalFrame
          kind={kind}
          accessMode={resolvedAccess}
          email={email}
          password={password}
          busy={busy}
          error={error}
          choices={choices}
          organizationId={organizationId}
          expiredNotice={expiredNotice}
          returnPath={returnPath}
          onEmail={setEmail}
          onPassword={setPassword}
          onOrganization={setOrganizationId}
          onSubmit={submit}
          onRetry={() => {
            void refresh();
          }}
          onCloseAccess={closeAccess}
        />
        </div>
      </main>
      <footer className="auth-gate__footer">
        <span>WorkOS © 2026</span>
        <span>v4.1 · SAAS_ONLY</span>
      </footer>
    </div>
  );
}

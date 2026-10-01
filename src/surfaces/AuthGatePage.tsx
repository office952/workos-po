import { useState, type FormEvent } from "react";
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
  const [power, setPower] = useState(false);
  const [accessMode, setAccessMode] = useState<AuthAccessMode>("idle");
  const expiredNotice = kind === "session_expired" || sessionExpired;
  const scene = power ? "night" : "day";
  const resolvedAccess: AuthAccessMode =
    kind === "session_expired" && accessMode === "idle" ? "societate" : accessMode;

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
            variant="secondary"
            aria-pressed={resolvedAccess === "angajat"}
            onClick={() => openAccess("angajat")}
          >
            Login Angajat
          </Button>
          <Button
            type="button"
            variant="primary"
            aria-pressed={resolvedAccess === "societate"}
            onClick={() => openAccess("societate")}
          >
            Login Societate
          </Button>
        </div>
      </header>
      <main id="autentificare" className="auth-gate__main" tabIndex={-1}>
        <SignLightDemo
          power={power}
          onPowerChange={setPower}
          onSelectSocietate={() => openAccess("societate")}
          onSelectAngajat={() => openAccess("angajat")}
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
      </main>
      <footer className="auth-gate__footer">
        <span>WorkOS © 2026</span>
        <span>v4.1 · SAAS_ONLY</span>
      </footer>
    </div>
  );
}

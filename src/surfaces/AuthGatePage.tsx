import { useId, useState, type FormEvent } from "react";
import type { CloudMembershipPresentation } from "../adapters/cloudSessionAdapter";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { FieldFrame } from "../components/FieldFrame";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SelectField } from "../components/SelectField";
import { loginErrorLabel, type CloudAuthGateKind } from "../session/cloudAuth";
import { useCloudSession } from "../session/CloudSessionContext";

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
  const expiredNotice = kind === "session_expired" || sessionExpired;
  const errorId = useId();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await login(email, password, choices ? organizationId : undefined);
      if (result.ok) {
        setPassword("");
        setChoices(null);
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

  return (
    <div className="auth-gate">
      <a className="skip-link" href="#autentificare">
        Sari la autentificare
      </a>
      <header className="auth-gate__brand">
        <span className="app-shell__brand">
          <BrandMark />
          <span className="app-shell__wordmark">WorkOS</span>
        </span>
      </header>
      <main id="autentificare" className="auth-gate__main" tabIndex={-1}>
        {renderGateBody({
          kind,
          email,
          password,
          busy,
          error,
          errorId,
          choices,
          organizationId,
          expiredNotice,
          returnPath,
          onEmail: setEmail,
          onPassword: setPassword,
          onOrganization: setOrganizationId,
          onSubmit: submit,
          onRetry: () => {
            void refresh();
          },
        })}
      </main>
    </div>
  );
}

function renderGateBody(input: {
  kind: CloudAuthGateKind;
  email: string;
  password: string;
  busy: boolean;
  error: string | null;
  errorId: string;
  choices: CloudMembershipPresentation[] | null;
  organizationId: string;
  expiredNotice: boolean;
  returnPath: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onOrganization: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: () => void;
}) {
  switch (input.kind) {
    case "boot":
      return (
        <section className="auth-gate__card ui-panel" aria-busy="true">
          <div className="ui-panel__body">
            <h1 className="auth-gate__title">Se încarcă</h1>
            <LoadingIndicator label="Pregătim accesul." />
          </div>
        </section>
      );
    case "auth_config_missing":
      return (
        <section className="auth-gate__card ui-panel">
          <div className="ui-panel__body">
            <h1 className="auth-gate__title">Autentificare indisponibilă</h1>
            <InlineAlert tone="blocked" title="Cloud nu este configurat">
              Autentificarea Cloud nu este configurată. Nu este o problemă de email sau parolă.
            </InlineAlert>
          </div>
        </section>
      );
    case "network":
      return (
        <section className="auth-gate__card ui-panel">
          <div className="ui-panel__body">
            <h1 className="auth-gate__title">Sistemul nu răspunde</h1>
            <InlineAlert tone="error" title="Conexiune întreruptă">
              Reîncearcă. Conexiunea s-a întrerupt.
            </InlineAlert>
            <Button variant="secondary" onClick={input.onRetry}>
              Reîncearcă
            </Button>
          </div>
        </section>
      );
    case "unauthenticated":
    case "session_expired":
      return (
        <form className="auth-gate__card ui-panel" onSubmit={input.onSubmit}>
          <div className="ui-panel__body">
            <h1 className="auth-gate__title">Autentificare</h1>
            <p className="auth-gate__lead">
              Intră cu email-ul și parola organizației. Identificarea operatorului se face
              separat, din Atelier, cu PIN.
            </p>
            {input.expiredNotice ? (
              <InlineAlert tone="pending" title="Sesiune expirată">
                Sesiunea a expirat. Autentifică-te din nou.
              </InlineAlert>
            ) : null}
            {input.returnPath !== "/" ? (
              <p className="u-visually-hidden">După autentificare revii la pagina cerută.</p>
            ) : null}
            <FieldFrame id="cloud-email" label="Email">
              <input
                id="cloud-email"
                className="field__control"
                type="email"
                autoComplete="username"
                value={input.email}
                disabled={input.busy}
                required
                onChange={(event) => input.onEmail(event.target.value)}
              />
            </FieldFrame>
            <FieldFrame id="cloud-password" label="Parolă">
              <input
                id="cloud-password"
                className="field__control"
                type="password"
                autoComplete="current-password"
                value={input.password}
                disabled={input.busy}
                required
                aria-invalid={Boolean(input.error)}
                aria-describedby={input.error ? input.errorId : undefined}
                onChange={(event) => input.onPassword(event.target.value)}
              />
            </FieldFrame>
            {input.choices ? (
              <SelectField
                id="cloud-organization"
                label="Organizație"
                value={input.organizationId}
                options={input.choices.map((item) => ({
                  value: item.organizationId,
                  label: item.displayName,
                }))}
                onChange={input.onOrganization}
              />
            ) : null}
            {input.error ? (
              <InlineAlert tone="error" title="Autentificarea nu a reușit">
                <span id={input.errorId}>{input.error}</span>
              </InlineAlert>
            ) : null}
            <div className="auth-gate__actions">
              <Button
                type="submit"
                className="auth-gate__submit"
                disabled={input.busy}
                aria-busy={input.busy || undefined}
              >
                {input.busy ? "Se autentifică…" : "Intră"}
              </Button>
            </div>
          </div>
        </form>
      );
    default: {
      const exhaustive: never = input.kind;
      return exhaustive;
    }
  }
}

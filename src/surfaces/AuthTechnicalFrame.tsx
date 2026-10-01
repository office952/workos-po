import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import type { CloudMembershipPresentation } from "../adapters/cloudSessionAdapter";
import { Button } from "../components/Button";
import { FieldFrame } from "../components/FieldFrame";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { SelectField } from "../components/SelectField";
import type { CloudAuthGateKind } from "../session/cloudAuth";

export type AuthAccessMode = "idle" | "societate" | "angajat";

type AuthTechnicalFrameProps = {
  kind: CloudAuthGateKind;
  accessMode: AuthAccessMode;
  email: string;
  password: string;
  busy: boolean;
  error: string | null;
  choices: CloudMembershipPresentation[] | null;
  organizationId: string;
  expiredNotice: boolean;
  returnPath: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onOrganization: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: () => void;
  onCloseAccess: () => void;
};

export function AuthTechnicalFrame({
  kind,
  accessMode,
  email,
  password,
  busy,
  error,
  choices,
  organizationId,
  expiredNotice,
  returnPath,
  onEmail,
  onPassword,
  onOrganization,
  onSubmit,
  onRetry,
  onCloseAccess,
}: AuthTechnicalFrameProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const errorId = useId();
  const activeAccess = accessMode === "idle" ? null : accessMode;
  const showAccess =
    activeAccess !== null && (kind === "unauthenticated" || kind === "session_expired");
  const showWorkbench = kind === "unauthenticated" || kind === "session_expired";
  const bayState =
    activeAccess === "societate"
      ? "AUTH BAY · SOCIETATE"
      : activeAccess === "angajat"
        ? "AUTH BAY · ANGAJAT"
        : "AUTH BAY · STANDBY";

  useEffect(() => {
    if (!showAccess) {
      return;
    }
    const node = panelRef.current;
    if (!node) {
      return;
    }
    node.focus({ preventScroll: true });
    if (typeof node.scrollIntoView === "function") {
      const reduced =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      node.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    }
  }, [showAccess, activeAccess, kind]);

  return (
    <aside className="auth-tech" aria-label="Cadru tehnic Auth Frame">
      <div className="auth-tech__grid" aria-hidden="true" />
      <div className="auth-tech__frame">
        <div className="auth-tech__meta auth-tech__meta--top">
          <span>WorkOS · AUTH_FRAME · REV.04</span>
          <span>{bayState}</span>
        </div>

        <div
          className="auth-tech__viewport"
          data-auth-active={showAccess ? "" : undefined}
        >
          {showWorkbench ? <AuthWorkbenchGraphic active={showAccess} /> : null}

          {showAccess && activeAccess ? (
            <section
              ref={panelRef}
              className="auth-tech__panel"
              tabIndex={-1}
              aria-labelledby="auth-tech-title"
            >
              <AuthAccessForm
                accessMode={activeAccess}
                email={email}
                password={password}
                busy={busy}
                error={error}
                errorId={errorId}
                choices={choices}
                organizationId={organizationId}
                expiredNotice={expiredNotice}
                returnPath={returnPath}
                onEmail={onEmail}
                onPassword={onPassword}
                onOrganization={onOrganization}
                onSubmit={onSubmit}
                onCloseAccess={onCloseAccess}
              />
            </section>
          ) : (
            <GateStatusBody kind={kind} onRetry={onRetry} />
          )}
        </div>

        <div className="auth-tech__meta auth-tech__meta--bottom">
          <span>VECTOR WORKBENCH · SIGNAGE PRODUCTION</span>
          <span>500 px · SCALA 1:1</span>
          <span>v4.1</span>
        </div>
      </div>
    </aside>
  );
}

function AuthWorkbenchGraphic({ active }: { active: boolean }) {
  return (
    <div className="auth-tech__workbench" data-active={active ? "" : undefined} aria-hidden="true">
      <div className="auth-tech__rings">
        <span className="auth-tech__ring auth-tech__ring--outer" />
        <span className="auth-tech__ring auth-tech__ring--mid" />
        <span className="auth-tech__target" />
        <span className="auth-tech__crosshair auth-tech__crosshair--x" />
        <span className="auth-tech__crosshair auth-tech__crosshair--y" />
      </div>
      <svg className="auth-tech__comet" viewBox="0 0 360 240" preserveAspectRatio="none">
        <path
          className="auth-tech__comet-glow"
          pathLength="1"
          d="M72 96 C132 88 168 104 208 138 C238 164 262 190 286 208"
        />
        <path
          className="auth-tech__comet-core"
          pathLength="1"
          d="M72 96 C132 88 168 104 208 138 C238 164 262 190 286 208"
        />
        <circle className="auth-tech__comet-head" cx="286" cy="208" r="3" />
      </svg>
      <div className="auth-tech__measure">
        <span />
        <em>150 px</em>
        <span />
      </div>
    </div>
  );
}

function GateStatusBody({
  kind,
  onRetry,
}: {
  kind: CloudAuthGateKind;
  onRetry: () => void;
}) {
  switch (kind) {
    case "boot":
      return (
        <div className="auth-tech__status" aria-busy="true">
          <h1 className="auth-gate__title">Se încarcă</h1>
          <LoadingIndicator label="Pregătim accesul." />
        </div>
      );
    case "auth_config_missing":
      return (
        <div className="auth-tech__status">
          <h1 className="auth-gate__title">Autentificare indisponibilă</h1>
          <InlineAlert tone="blocked" title="Cloud nu este configurat">
            Autentificarea Cloud nu este configurată. Nu este o problemă de email sau parolă.
          </InlineAlert>
        </div>
      );
    case "network":
      return (
        <div className="auth-tech__status">
          <h1 className="auth-gate__title">Sistemul nu răspunde</h1>
          <InlineAlert tone="error" title="Conexiune întreruptă">
            Reîncearcă. Conexiunea s-a întrerupt.
          </InlineAlert>
          <Button variant="secondary" onClick={onRetry}>
            Reîncearcă
          </Button>
        </div>
      );
    case "unauthenticated":
    case "session_expired":
      return null;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function AuthAccessForm(input: {
  accessMode: Exclude<AuthAccessMode, "idle">;
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
  onCloseAccess: () => void;
}) {
  const copy = accessCopy(input.accessMode);

  return (
    <form className="auth-tech__form" onSubmit={input.onSubmit}>
      <div className="auth-tech__form-head">
        <p className="auth-gate__eyebrow">{copy.eyebrow}</p>
        <h1 id="auth-tech-title" className="auth-gate__title">
          {copy.title}
        </h1>
        <p className="auth-gate__lead">{copy.lead}</p>
      </div>

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

      <div className="auth-gate__actions auth-tech__actions">
        <Button
          type="submit"
          className="auth-gate__submit"
          disabled={input.busy}
          aria-busy={input.busy || undefined}
        >
          {input.busy ? "Se autentifică…" : "Intră"}
        </Button>
        <Button type="button" variant="ghost" onClick={input.onCloseAccess}>
          Înapoi
        </Button>
      </div>
    </form>
  );
}

function accessCopy(mode: Exclude<AuthAccessMode, "idle">): {
  eyebrow: string;
  title: string;
  lead: ReactNode;
} {
  switch (mode) {
    case "societate":
      return {
        eyebrow: "WORKOS / AUTH FRAME · SOCIETATE",
        title: "Acces Societate",
        lead: "Intră cu email-ul și parola organizației. Identificarea operatorului se face separat, din Atelier, cu PIN.",
      };
    case "angajat":
      return {
        eyebrow: "WORKOS / AUTH FRAME · ANGAJAT",
        title: "Acces Angajat",
        lead: "Autentificați-vă cu contul de angajat pentru acces atelier.",
      };
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

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
  }, [showAccess, activeAccess, kind]);

  return (
    <aside className="auth-tech" aria-label="Cadru tehnic Auth Frame">
      <div className="auth-tech__grid" aria-hidden="true" />
      <div className="auth-tech__frame">
        <div className="auth-tech__bay-label">
          <span>{bayState}</span>
          <i aria-hidden="true" />
        </div>

        <div
          className="auth-tech__viewport"
          data-auth-active={showAccess ? "" : undefined}
        >
          <span className="auth-tech__frame-label" aria-hidden="true">
            WorkOS · AUTH_FRAME · REV.04
          </span>
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
              />
            </section>
          ) : (
            <GateStatusBody kind={kind} onRetry={onRetry} />
          )}
        </div>

        <div className="auth-tech__bottom-meta">
          <span className="auth-tech__bottom-left">VECTOR WORKBENCH · SIGNAGE PRODUCTION</span>
          <span className="auth-tech__bottom-center">500 px · SCALA 1:1</span>
          <span className="auth-tech__bottom-right">v4.1</span>
        </div>
      </div>
    </aside>
  );
}

function AuthWorkbenchGraphic({ active }: { active: boolean }) {
  return (
    <div className="auth-tech__workbench" data-active={active ? "" : undefined} aria-hidden="true">
      <svg
        className="auth-tech__blueprint"
        viewBox="0 0 548 676"
        preserveAspectRatio="xMidYMid meet"
      >
        <g className="auth-tech__blueprint-base">
          <path d="M24 166 H66 M24 166 V208" />
          <path d="M482 166 H524 M524 166 V208" />
          <path d="M24 450 V492 H66" />
          <path d="M482 492 H524 V450" />
          <path d="M274 166 V492" />
          <path d="M24 329 H524" />
          <circle cx="274" cy="329" r="100" />
          <rect x="199" y="254" width="150" height="150" />
          <circle cx="274" cy="329" r="3" />
        </g>

        <g className="auth-tech__blueprint-dynamic">
          <path
            className="auth-tech__arc auth-tech__arc--a"
            d="M178.005 366.004 C161.005 330.004 163.005 289.004 186.005 255.004 C209.005 222.004 249.005 207.004 288.005 215.004"
          />
          <path
            className="auth-tech__arc auth-tech__arc--b"
            d="M318 227 C354 249 376 289 374 331 C372 370 350 405 316 424"
          />
          <path className="auth-tech__handle" d="M199 282 L291 316" />
          <circle className="auth-tech__node auth-tech__node--main" cx="274" cy="330" r="3" />
          <circle className="auth-tech__node" cx="199" cy="282" r="2.5" />
          <circle className="auth-tech__node" cx="370" cy="294" r="2.5" />
          <path className="auth-tech__tick" d="M182 238 H200 M182 238 V256" />
          <path className="auth-tech__tick" d="M348 421 H366 M366 404 V422" />
        </g>

        <g className="auth-tech__comet-trail">
          <path
            className="auth-tech__comet-glow"
            pathLength="1"
            d="M176 246 C212 250 244 267 270 294 C301 326 326 365 340 410"
          />
          <path
            className="auth-tech__comet-core"
            pathLength="1"
            d="M176 246 C212 250 244 267 270 294 C301 326 326 365 340 410"
          />
          <path
            className="auth-tech__comet-echo"
            pathLength="1"
            d="M183 250 C219 254 251 271 277 298 C308 330 333 369 347 414"
          />
          <circle className="auth-tech__comet-head" cx="340" cy="410" r="3" />
        </g>
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

      <FieldFrame id="cloud-email" label="Adresă email">
        <input
          id="cloud-email"
          className="field__control"
          type="email"
          autoComplete="username"
          placeholder={input.accessMode === "societate" ? "contact@firma.ro" : "prenume.nume@firma.ro"}
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
          {input.busy ? "Se autentifică…" : "Autentificare"}
        </Button>
      </div>

      <div className="auth-tech__roles" aria-label="Tipuri de acces WorkOS">
        <div className="auth-tech__role">
          <span>SOCIETATE</span>
          <strong>Clienți · Oferte · Administrare</strong>
        </div>
        <div className="auth-tech__role">
          <span>ANGAJAT</span>
          <strong>Execuție · Plan de lucru · Urmărire</strong>
        </div>
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
        eyebrow: "WORKOS / AUTH FRAME",
        title: "Acces Societate",
        lead: "Autentifică-te pentru accesul la mediul de lucru al organizației.",
      };
    case "angajat":
      return {
        eyebrow: "WORKOS / AUTH FRAME",
        title: "Acces Angajat",
        lead: "Autentifică-te cu contul de angajat pentru accesul la Atelier.",
      };
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

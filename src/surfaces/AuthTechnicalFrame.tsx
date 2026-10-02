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
  const anchors = [
    [299, 170],
    [172, 330],
    [292, 488],
    [390, 228],
    [301, 235],
    [390, 331],
    [307, 434],
    [222, 331],
  ] as const;

  return (
    <div
      className="auth-tech__workbench auth-workbench-v2"
      data-active={active ? "" : undefined}
      aria-hidden="true"
    >
      <svg
        className="auth-workbench-v2__svg"
        viewBox="0 0 548 676"
        preserveAspectRatio="xMidYMid meet"
      >
        <g className="auth-workbench-v2__ambient">
          <path
            className="auth-workbench-v2__crop"
            d="M76 136V108H104 M442 108H470V136 M76 518V546H104 M442 546H470V518"
          />
          <path
            className="auth-workbench-v2__orbit auth-workbench-v2__orbit--primary"
            d="M170 414A142 142 0 0 1 386 224 M196 444A164 164 0 0 0 410 290"
          />
          <circle className="auth-workbench-v2__orbit auth-workbench-v2__orbit--secondary" cx="274" cy="329" r="165" />
          <g className="auth-workbench-v2__ticks">
            <path d="M274 151V163 M356 173L350 184 M414 232L403 238 M437 314H425 M414 396L403 390 M356 455L350 444 M274 478V466 M192 455L198 444 M134 396L145 390 M111 314H123 M134 232L145 238 M192 173L198 184" />
          </g>
        </g>

        <g className="auth-workbench-v2__object">
          <g transform="translate(94 132)">
            <path
              className="auth-workbench-v2__back"
              fillRule="evenodd"
              d="M205 38C132 38 72 101 78 198C78 296 132 355 200 355C243 355 276 334 296 298L296 350L346 350L346 45L296 45L296 96C272 57 242 38 205 38ZM207 103C255 103 296 145 296 199C296 257 259 302 213 302C164 302 122 264 128 199C128 140 159 103 207 103Z"
            />
            <path className="auth-workbench-v2__side auth-workbench-v2__side--top" d="M205 38C242 38 272 57 296 96L307 104C282 65 252 46 216 46Z" />
            <path className="auth-workbench-v2__side auth-workbench-v2__side--stem" d="M296 45H346L357 53H307ZM296 96L307 104V358L296 350Z" />
            <path className="auth-workbench-v2__side auth-workbench-v2__side--lower" d="M200 355C243 355 276 334 296 298L307 306C286 343 253 364 211 364Z" />
            <path className="auth-workbench-v2__side auth-workbench-v2__side--inner" d="M213 302C259 302 296 257 296 199L307 207C307 265 270 310 224 310Z" />

            <path
              className="auth-workbench-v2__face auth-workbench-v2__face--base"
              fillRule="evenodd"
              d="M205 38C132 38 78 101 78 198C78 296 128 356 198 356C239 356 273 335 296 299L296 350L346 350L346 45L296 45L296 96C272 57 242 38 205 38ZM207 103C255 103 296 145 296 199C296 257 259 302 213 302C164 302 128 262 128 199C128 142 159 103 207 103Z"
            />
            <path
              className="auth-workbench-v2__face auth-workbench-v2__face--repaired"
              fillRule="evenodd"
              d="M205 38C132 38 72 101 78 198C78 296 132 355 200 355C243 355 276 334 296 298L296 350L346 350L346 45L296 45L296 96C272 57 242 38 205 38ZM207 103C255 103 296 145 296 199C296 257 259 302 213 302C164 302 122 264 128 199C128 140 159 103 207 103Z"
            />

            <path className="auth-workbench-v2__local auth-workbench-v2__local--one-before" d="M205 38C132 38 78 101 78 198C78 296 128 356 198 356" />
            <path className="auth-workbench-v2__local auth-workbench-v2__local--one-after" d="M205 38C132 38 72 101 78 198C78 296 132 355 198 356" />
            <path className="auth-workbench-v2__local auth-workbench-v2__local--two-before" d="M213 302C164 302 128 262 128 199C128 142 159 103 207 103" />
            <path className="auth-workbench-v2__local auth-workbench-v2__local--two-after" d="M213 302C164 302 122 264 128 199C128 140 159 103 207 103" />
            <path className="auth-workbench-v2__local auth-workbench-v2__local--three-before" d="M78 198C78 296 128 356 198 356C239 356 273 335 296 299" />
            <path className="auth-workbench-v2__local auth-workbench-v2__local--three-after" d="M78 198C78 296 132 355 200 355C243 355 276 334 296 298" />
          </g>

          <g className="auth-workbench-v2__nodes">
            {anchors.map(([x, y], index) => (
              <rect
                key={`${x}-${y}`}
                className={`auth-workbench-v2__anchor auth-workbench-v2__anchor--${index + 1}`}
                x={x - 2.5}
                y={y - 2.5}
                width="5"
                height="5"
              />
            ))}
          </g>

          <g className="auth-workbench-v2__edit auth-workbench-v2__edit--one">
            <rect className="auth-workbench-v2__selected" x="168.5" y="326.5" width="7" height="7" />
            <path className="auth-workbench-v2__handle-line" d="M172 330V255 M172 330V405" />
            <circle className="auth-workbench-v2__handle-end auth-workbench-v2__handle-end--one" cx="172" cy="255" r="2.5" />
            <circle className="auth-workbench-v2__handle-end" cx="172" cy="405" r="2.5" />
          </g>

          <g className="auth-workbench-v2__edit auth-workbench-v2__edit--two">
            <rect className="auth-workbench-v2__selected" x="218.5" y="327.5" width="7" height="7" />
            <path className="auth-workbench-v2__handle-line" d="M222 331V274 M222 331V388" />
            <circle className="auth-workbench-v2__handle-end" cx="222" cy="274" r="2.5" />
            <circle className="auth-workbench-v2__handle-end auth-workbench-v2__handle-end--two" cx="222" cy="388" r="2.5" />
          </g>

          <g className="auth-workbench-v2__edit auth-workbench-v2__edit--three">
            <rect className="auth-workbench-v2__selected auth-workbench-v2__selected--nudge" x="288.5" y="484.5" width="7" height="7" />
            <path className="auth-workbench-v2__handle-line" d="M292 488H235 M292 488H333" />
            <circle className="auth-workbench-v2__handle-end" cx="235" cy="488" r="2.5" />
            <circle className="auth-workbench-v2__handle-end auth-workbench-v2__handle-end--three" cx="333" cy="488" r="2.5" />
          </g>

          <rect className="auth-workbench-v2__cusp" x="386.5" y="224.5" width="7" height="7" />
          <path className="auth-workbench-v2__cusp-segment" d="M390 228L390 177L440 177" />

          <path className="auth-workbench-v2__projection auth-workbench-v2__projection--one" d="M299 170L310 178" />
          <path className="auth-workbench-v2__projection auth-workbench-v2__projection--two" d="M390 228L401 236" />
          <path className="auth-workbench-v2__projection auth-workbench-v2__projection--three" d="M294 487L305 495" />
          <path className="auth-workbench-v2__projection auth-workbench-v2__projection--four" d="M390 331L401 339" />
          <path className="auth-workbench-v2__depth-cue" d="M404 210L438 234" />

          <path
            className="auth-workbench-v2__verify"
            fillRule="evenodd"
            d="M299 170C226 170 166 233 172 330C172 428 226 487 294 487C337 487 370 466 390 430L390 482H440V177H390V228C366 189 336 170 299 170ZM301 235C349 235 390 277 390 331C390 389 353 434 307 434C258 434 216 396 222 331C222 272 253 235 301 235Z"
          />
        </g>

        <g className="auth-workbench-v2__cursor">
          <path d="M0 0V17.5L4.4 12.9L7.6 20L10.6 18.6L7.4 11.7H14Z" />
        </g>

        <g className="auth-workbench-v2__sweep">
          <path d="M274 329L378 329" />
          <circle cx="378" cy="329" r="2" />
        </g>
      </svg>
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

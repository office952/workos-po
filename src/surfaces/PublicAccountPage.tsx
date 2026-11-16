import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  acceptInvitation,
  completeEmailVerification,
  completePasswordReset,
  previewInvitation,
  requestPasswordReset,
} from "../api/organizationAccess";
import { readTransportReasons } from "../api/http";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { FieldFrame } from "../components/FieldFrame";
import { InlineAlert } from "../components/InlineAlert";
import type { PublicAccountRoute } from "../routing/appRoute";
import "../styles/surfaces/account.css";

/**
 * V1 Organization Access · public single-use token pages (invitation, password reset, email
 * verification). The token travels in the URL fragment (#t=…) so it never reaches server logs or
 * Referer; it is sent to the API in a POST body. VISUAL_OWNER_REVIEW_REQUIRED: no accepted
 * WorkOS-N frame for these states yet; built from the existing form components only.
 */
function readToken(): string {
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return params.get("t") ?? "";
}

function reasonOf(body: unknown, fallback: string): string {
  return readTransportReasons(body)[0] ?? fallback;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    // `app-shell` carries the WorkOS machine theme (signal colour, canvas) also outside the shell.
    <div className="app-shell acct-public" data-visual-review="required">
      <header className="acct-public__brand">
        <span className="app-shell__brand">
          <BrandMark />
          <span className="app-shell__wordmark">WorkOS</span>
        </span>
      </header>
      <main className="acct-public__main" id="continut" tabIndex={-1}>
        <section className="acct-card" aria-labelledby="acct-public-title">
          <h1 id="acct-public-title" className="acct-card__title">
            {title}
          </h1>
          {children}
        </section>
      </main>
    </div>
  );
}

function PasswordFields({ value, confirm, onValue, onConfirm, label = "Parola nouă" }: { value: string; confirm: string; onValue: (v: string) => void; onConfirm: (v: string) => void; label?: string }) {
  return (
    <>
      <FieldFrame id="acct-new-password" label={label} hint="Cel puțin 10 caractere. Nu folosi adresa de email.">
        <input id="acct-new-password" className="field__control" type="password" autoComplete="new-password" value={value} onChange={(event) => onValue(event.target.value)} />
      </FieldFrame>
      <FieldFrame id="acct-confirm-password" label="Confirmă parola" error={confirm && confirm !== value ? "Parolele nu coincid." : undefined}>
        <input id="acct-confirm-password" className="field__control" type="password" autoComplete="new-password" value={confirm} onChange={(event) => onConfirm(event.target.value)} />
      </FieldFrame>
    </>
  );
}

function InvitationPage({ signedInEmail }: { signedInEmail: string | null }) {
  const token = readToken();
  const [preview, setPreview] = useState<{ organizationDisplayName: string; roleLabel: string; maskedEmail: string; expiresAt: string } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "accepted">("loading");
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void previewInvitation(token).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setPreview(result.body as typeof preview);
        setState("ready");
      } else {
        setState("unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(chosen: "existing" | "new" | "session"): Promise<void> {
    setError(null);
    if (chosen === "new" && (password.length < 10 || password !== confirm)) {
      setError("Verifică parola: cel puțin 10 caractere, identică în ambele câmpuri.");
      return;
    }
    setBusy(true);
    const result = await acceptInvitation(token, chosen, password);
    setBusy(false);
    if (result.ok) {
      setState("accepted");
      // The session cookie is set; a full load starts the application in the invited organization.
      window.location.assign("/");
      return;
    }
    if (result.status === 410) {
      setState("unavailable");
      return;
    }
    setError(reasonOf(result.body, "Invitația nu a putut fi acceptată."));
  }

  if (state === "loading") return <Shell title="Invitație">{<p>Se verifică invitația…</p>}</Shell>;
  if (state === "unavailable") {
    return (
      <Shell title="Invitația nu mai este valabilă">
        <p>Linkul a expirat, a fost deja folosit sau a fost revocat. Cere proprietarului organizației o invitație nouă.</p>
        <a className="text-link" href="/">Mergi la autentificare</a>
      </Shell>
    );
  }
  if (state === "accepted" || !preview) return <Shell title="Invitație acceptată">{<p>Se deschide aplicația…</p>}</Shell>;

  return (
    <Shell title={`Ai fost invitat în ${preview.organizationDisplayName}`}>
      <p className="acct-card__lead">
        Rol: <strong>{preview.roleLabel}</strong> · pentru adresa {preview.maskedEmail}
      </p>
      {error ? (
        <InlineAlert tone="error" title="Nu s-a putut continua">
          {error}
        </InlineAlert>
      ) : null}
      {signedInEmail ? (
        <div className="acct-card__block">
          <p>
            Ești autentificat ca <strong>{signedInEmail}</strong>. Dacă invitația este pentru această adresă, acceptă direct.
          </p>
          <Button disabled={busy} onClick={() => void submit("session")}>
            Acceptă accesul
          </Button>
          <p className="acct-card__hint">Dacă invitația este pentru altă adresă, ieși din cont și deschide din nou linkul.</p>
        </div>
      ) : (
        <form
          className="acct-card__form"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void submit(mode);
          }}
        >
          <fieldset className="acct-choice">
            <legend>Ai deja cont WorkOS cu această adresă?</legend>
            <label>
              <input type="radio" name="acct-mode" checked={mode === "new"} onChange={() => setMode("new")} /> Nu, creez parola acum
            </label>
            <label>
              <input type="radio" name="acct-mode" checked={mode === "existing"} onChange={() => setMode("existing")} /> Da, folosesc parola existentă
            </label>
          </fieldset>
          {mode === "existing" ? (
            <FieldFrame id="acct-existing-password" label="Parola contului existent">
              <input id="acct-existing-password" className="field__control" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </FieldFrame>
          ) : (
            <PasswordFields value={password} confirm={confirm} onValue={setPassword} onConfirm={setConfirm} label="Parola ta" />
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Se acceptă…" : "Acceptă invitația"}
          </Button>
        </form>
      )}
    </Shell>
  );
}

function PasswordResetPage() {
  const token = readToken();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"idle" | "requested" | "done" | "unavailable">("idle");
  const [selfService, setSelfService] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Shell title="Am uitat parola">
        {result === "requested" ? (
          selfService ? (
            <p>Dacă adresa are cont WorkOS cu email verificat, vei primi un link de resetare, valabil o oră.</p>
          ) : (
            <p>Trimiterea pe email nu este activă. Contactează suportul WorkOS pentru recuperarea accesului.</p>
          )
        ) : (
          <form
            className="acct-card__form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              setBusy(true);
              void requestPasswordReset(email.trim()).then((response) => {
                setBusy(false);
                setSelfService(Boolean((response.body as { selfServiceAvailable?: boolean } | null)?.selfServiceAvailable));
                setResult("requested");
              });
            }}
          >
            <FieldFrame id="acct-reset-email" label="Email">
              <input id="acct-reset-email" className="field__control" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </FieldFrame>
            <Button type="submit" disabled={busy || !email.trim()}>
              Trimite linkul
            </Button>
          </form>
        )}
        <a className="text-link" href="/">Înapoi la autentificare</a>
      </Shell>
    );
  }
  if (result === "done") {
    return (
      <Shell title="Parola a fost setată">
        <p>Toate sesiunile vechi au fost închise. Autentifică-te cu parola nouă.</p>
        <a className="text-link" href="/">Mergi la autentificare</a>
      </Shell>
    );
  }
  if (result === "unavailable") {
    return (
      <Shell title="Linkul nu mai este valabil">
        <p>Linkul a expirat sau a fost deja folosit. Cere un link nou.</p>
        <a className="text-link" href="/resetare-parola">Cere un link nou</a>
      </Shell>
    );
  }
  return (
    <Shell title="Setează o parolă nouă">
      {error ? (
        <InlineAlert tone="error" title="Parola nu a fost setată">
          {error}
        </InlineAlert>
      ) : null}
      <form
        className="acct-card__form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (password.length < 10 || password !== confirm) {
            setError("Verifică parola: cel puțin 10 caractere, identică în ambele câmpuri.");
            return;
          }
          setBusy(true);
          void completePasswordReset(token, password).then((response) => {
            setBusy(false);
            if (response.ok) setResult("done");
            else if (response.status === 410) setResult("unavailable");
            else setError(reasonOf(response.body, "Parola nu a putut fi setată."));
          });
        }}
      >
        <PasswordFields value={password} confirm={confirm} onValue={setPassword} onConfirm={setConfirm} />
        <Button type="submit" disabled={busy}>
          {busy ? "Se salvează…" : "Setează parola"}
        </Button>
      </form>
    </Shell>
  );
}

/**
 * The verification token is single-use on the server. A component may run its effect more than once
 * (React StrictMode in development, a remount): every run for the same token shares ONE request, so
 * a genuine success is never followed by a contradictory "link expired". A new page load sends a
 * new request and the server stays the authority (a used token answers 410).
 */
const emailVerificationAttempts = new Map<string, Promise<boolean>>();
function verifyEmailTokenOnce(token: string): Promise<boolean> {
  let attempt = emailVerificationAttempts.get(token);
  if (!attempt) {
    attempt = completeEmailVerification(token).then((result) => result.ok, () => false);
    emailVerificationAttempts.set(token, attempt);
  }
  return attempt;
}

function EmailVerificationPage() {
  const token = readToken();
  const [state, setState] = useState<"pending" | "done" | "unavailable">("pending");
  useEffect(() => {
    let cancelled = false;
    void verifyEmailTokenOnce(token).then((ok) => {
      if (!cancelled) setState(ok ? "done" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [token]);
  return (
    <Shell title={state === "done" ? "Email verificat" : state === "unavailable" ? "Linkul nu mai este valabil" : "Se verifică emailul…"}>
      {state === "done" ? <p>Adresa ta este verificată. De acum poți recupera singur parola, dacă o uiți.</p> : null}
      {state === "unavailable" ? <p>Cere un link nou din Contul meu › Securitate.</p> : null}
      <a className="text-link" href="/">Mergi în aplicație</a>
    </Shell>
  );
}

export function PublicAccountPage({ kind, signedInEmail }: { kind: PublicAccountRoute; signedInEmail: string | null }) {
  switch (kind) {
    case "invitation":
      return <InvitationPage signedInEmail={signedInEmail} />;
    case "password-reset":
      return <PasswordResetPage />;
    case "email-verification":
      return <EmailVerificationPage />;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

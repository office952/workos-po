import { useEffect, useState, type FormEvent } from "react";
import {
  changeOwnPassword,
  fetchAccountSecurity,
  requestOwnEmailVerification,
  revokeOtherSessions,
} from "../api/organizationAccess";
import { readTransportReasons } from "../api/http";
import { Button } from "../components/Button";
import { FieldFrame } from "../components/FieldFrame";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { PageRegion } from "../layout/PageRegion";
import { formatTimestamp } from "../presentation/format";
import "../styles/surfaces/account.css";

/**
 * V1 Organization Access · Contul meu › Securitate. The user's own password, sessions,
 * organizations and security events. Not the operational people (Administrare › Oameni).
 * VISUAL_OWNER_REVIEW_REQUIRED (state V5): built from existing components and tokens only.
 */
type Security = {
  email: string;
  emailVerified: boolean;
  passwordChangedAt: string | null;
  emailDeliveryAvailable: boolean;
  sessions: Array<{ createdAt: string; lastSeenAt: string; current: boolean }>;
  memberships: Array<{ organizationId: string; displayName: string; roleLabel: string }>;
  recentEvents: Array<{ eventId: string; action: string; createdAt: string }>;
};

const EVENT_LABELS: Record<string, string> = {
  "credential.password_changed": "Parola a fost schimbată",
  "credential.password_reset": "Parola a fost resetată",
  "credential.email_verified": "Emailul a fost verificat",
  "credential.recovery_requested": "S-a cerut un link de recuperare",
  "credential.recovery_issued_by_platform": "Suportul WorkOS a emis un link de recuperare",
  "session.revoked_others": "Celelalte sesiuni au fost închise",
  "membership.attached": "Ai primit acces într-o organizație",
  "membership.reactivated": "Accesul tău a fost redat",
  "membership.revoked": "Accesul tău într-o organizație a fost retras",
  "membership.role_changed": "Rolul tău a fost schimbat",
  "invitation.accepted": "Ai acceptat o invitație",
};

export function AccountSecurityPage() {
  const [data, setData] = useState<Security | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; title: string; text: string } | null>(null);

  function load(): void {
    void fetchAccountSecurity()
      .then((body) => {
        setData(body as Security);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }

  useEffect(load, []);

  async function submitPassword(event: FormEvent): Promise<void> {
    event.preventDefault();
    setMessage(null);
    if (next.length < 10 || next !== confirm) {
      setMessage({ tone: "error", title: "Parola nu a fost schimbată", text: "Parola nouă trebuie să aibă cel puțin 10 caractere și să fie identică în ambele câmpuri." });
      return;
    }
    setBusy(true);
    const result = await changeOwnPassword(current, next);
    setBusy(false);
    if (result.ok) {
      const closed = (result.body as { otherSessionsClosed?: number } | null)?.otherSessionsClosed ?? 0;
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ tone: "success", title: "Parola a fost schimbată", text: closed > 0 ? `Celelalte ${closed} sesiuni au fost închise. Rămâi autentificat aici.` : "Rămâi autentificat pe acest dispozitiv." });
      load();
      return;
    }
    setMessage({ tone: "error", title: "Parola nu a fost schimbată", text: readTransportReasons(result.body)[0] ?? "Verifică parola curentă și reîncearcă." });
  }

  if (loadError) {
    return (
      <PageRegion>
        <InlineAlert tone="error" title="Securitatea contului nu este disponibilă">
          Reîncarcă pagina peste câteva momente.
        </InlineAlert>
      </PageRegion>
    );
  }
  if (!data) {
    return (
      <PageRegion>
        <LoadingFloor label="Se încarcă securitatea contului" />
      </PageRegion>
    );
  }

  const others = data.sessions.filter((session) => !session.current).length;

  return (
    <PageRegion>
      <div className="acct-page" data-visual-review="required">
        <header className="acct-page__header">
          <p className="acct-page__eyebrow">Contul meu</p>
          <h1 className="acct-page__title">Securitate</h1>
          <p className="acct-page__lead">Parola, sesiunile și organizațiile contului tău. Persoanele din atelier și PIN-urile se administrează separat, la Administrare › Oameni.</p>
        </header>
        <div aria-live="polite">
          {message ? (
            <InlineAlert tone={message.tone} title={message.title}>
              {message.text}
            </InlineAlert>
          ) : null}
        </div>

        <section className="acct-section" aria-labelledby="acct-account">
          <h2 id="acct-account">Contul</h2>
          <dl className="acct-facts">
            <div>
              <dt>Email</dt>
              <dd>{data.email}</dd>
            </div>
            <div>
              <dt>Verificare email</dt>
              <dd>
                {data.emailVerified ? "Verificat" : "Neverificat"}
                {!data.emailVerified && data.emailDeliveryAvailable ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void requestOwnEmailVerification().then((result) =>
                        setMessage(result.ok
                          ? { tone: "success", title: "Link trimis", text: `Am trimis un link de verificare la ${data.email}. Este valabil o oră.` }
                          : { tone: "error", title: "Linkul nu a fost trimis", text: readTransportReasons(result.body)[0] ?? "Reîncearcă mai târziu." }),
                      );
                    }}
                  >
                    Trimite linkul de verificare
                  </Button>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Parola schimbată</dt>
              <dd>{data.passwordChangedAt ? formatTimestamp(data.passwordChangedAt) : "Necunoscut"}</dd>
            </div>
          </dl>
          {!data.emailVerified ? (
            <p className="acct-hint">
              {data.emailDeliveryAvailable
                ? "Cu emailul verificat îți poți reseta singur parola dacă o uiți."
                : "Dacă îți pierzi parola, suportul WorkOS te poate ajuta după verificarea identității."}
            </p>
          ) : null}
        </section>

        <section className="acct-section" aria-labelledby="acct-password">
          <h2 id="acct-password">Schimbă parola</h2>
          <form className="acct-form" onSubmit={(event) => void submitPassword(event)}>
            <FieldFrame id="acct-current" label="Parola curentă">
              <input id="acct-current" className="field__control" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
            </FieldFrame>
            <FieldFrame id="acct-next" label="Parola nouă" hint="Cel puțin 10 caractere. Celelalte sesiuni se închid.">
              <input id="acct-next" className="field__control" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
            </FieldFrame>
            <FieldFrame id="acct-confirm" label="Confirmă parola nouă" error={confirm && confirm !== next ? "Parolele nu coincid." : undefined}>
              <input id="acct-confirm" className="field__control" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </FieldFrame>
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? "Se schimbă…" : "Schimbă parola"}
              </Button>
            </div>
          </form>
        </section>

        <section className="acct-section" aria-labelledby="acct-sessions">
          <h2 id="acct-sessions">Sesiuni active</h2>
          <ul className="acct-list">
            {data.sessions.map((session) => (
              <li key={`${session.createdAt}-${session.current}`}>
                <span>{session.current ? "Această sesiune" : "Altă sesiune"}</span>
                <span>
                  începută {formatTimestamp(session.createdAt)} · expiră după 12 ore
                </span>
              </li>
            ))}
          </ul>
          {others > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                void revokeOtherSessions().then((result) => {
                  if (result.ok) {
                    setMessage({ tone: "success", title: "Sesiuni închise", text: "Celelalte sesiuni ale contului au fost închise." });
                    load();
                  }
                });
              }}
            >
              Închide celelalte sesiuni
            </Button>
          ) : null}
        </section>

        <section className="acct-section" aria-labelledby="acct-orgs">
          <h2 id="acct-orgs">Organizațiile mele</h2>
          <ul className="acct-list">
            {data.memberships.map((membership) => (
              <li key={membership.organizationId}>
                <span>{membership.displayName}</span>
                <span>{membership.roleLabel}</span>
              </li>
            ))}
          </ul>
          <p className="acct-hint">Schimbi organizația activă din meniul Cont.</p>
        </section>

        <section className="acct-section" aria-labelledby="acct-events">
          <h2 id="acct-events">Evenimente recente</h2>
          {data.recentEvents.length === 0 ? (
            <p className="acct-hint">Niciun eveniment de securitate.</p>
          ) : (
            <ul className="acct-list">
              {data.recentEvents.map((event) => (
                <li key={event.eventId}>
                  <span>{EVENT_LABELS[event.action] ?? "Eveniment de securitate"}</span>
                  <span>{formatTimestamp(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageRegion>
  );
}

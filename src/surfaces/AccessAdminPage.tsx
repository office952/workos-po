import { useState, type ReactNode } from "react";
import { AdminLayout } from "../admin/AdminLayout";
import { adminFailureContent, describeAdminFailure } from "../admin/serverMessages";
import {
  AdminConfirmDialog,
  AdminPolicyOptions,
  AdminReadOnlyNote,
  AdminSection,
} from "../admin/adminParts";
import {
  presentOrganizationAccessAdmin,
  type OrganizationAccessAdminTransport,
  type OrganizationAccessInvitation,
  type OrganizationAccessMember,
} from "../adapters/organizationAccessAdapter";
import {
  changeOrganizationMemberRole,
  fetchOrganizationAccessEvents,
  inviteOrganizationUser,
  requestMemberRecovery,
  resendOrganizationInvitation,
  revokeOrganizationAccessMembership,
  revokeOrganizationInvitation,
} from "../api/organizationAccess";
import type { JsonResult } from "../api/http";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { LoadingFloor } from "../components/LoadingFloor";
import { invalidateAfterOrganizationAccessChange } from "../data/invalidation";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadOrganizationAccessAdmin } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { presentAdminEditMeta } from "../presentation/adminEditMeta";
import { formatTimestamp } from "../presentation/format";
import "../styles/surfaces/access.css";

type SaveState = "idle" | "pending" | "success" | "error";

/** Refusals of the access endpoints, in operator wording (the server also sends `reasons`). */
const ACCESS_CODES = {
  last_owner_removal: "Este ultimul proprietar activ al organizației. Accesul lui nu poate fi revocat sau retrogradat.",
  membership_missing: "Accesul nu mai există. Lista a fost probabil schimbată între timp; reîncarcă pagina.",
  forbidden: "Nu ai dreptul să gestionezi accesul. Doar proprietarul organizației îl poate face.",
  already_member: "Acest utilizator are deja acces. Poți schimba rolul din listă.",
  invitation_pending: "Există deja o invitație în așteptare pentru această adresă.",
  invalid_email: "Adresa de email nu este validă.",
  roles_not_enabled: "Rolurile Producție și Atelier nu sunt încă activate pentru organizații.",
  recovery_channel_unavailable: "Recuperarea pe email nu este disponibilă pentru acest utilizator.",
  rate_limited: "Prea multe încercări. Reîncearcă mai târziu.",
} as const;

type Dialog =
  | { kind: "invite" }
  | { kind: "role"; member: OrganizationAccessMember }
  | { kind: "revoke"; member: OrganizationAccessMember }
  | { kind: "recovery"; member: OrganizationAccessMember }
  | { kind: "revoke-invitation"; invitation: OrganizationAccessInvitation };

type AccessEvent = { eventId: string; action: string; actorEmail: string | null; subjectEmail: string | null; createdAt: string };

/** Operator wording for the audit trail; internal action codes never reach the screen. */
const EVENT_LABELS: Record<string, string> = {
  "invitation.created": "Invitație creată",
  "invitation.resent": "Invitație retrimisă",
  "invitation.revoked": "Invitație revocată",
  "invitation.accepted": "Invitație acceptată",
  "invitation.expired": "Invitație expirată",
  "invitation.accept_refused_disabled": "Acceptare refuzată (cont dezactivat)",
  "membership.attached": "Acces acordat",
  "membership.reactivated": "Acces redat",
  "membership.revoked": "Acces revocat",
  "membership.role_changed": "Rol schimbat",
  "credential.recovery_requested": "Recuperare a parolei cerută",
};

export function AccessAdminPage() {
  const admin = useResource(resourceKeys.organizationAccessAdmin(), loadOrganizationAccessAdmin);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<ReactNode>(null);
  const [source, setSource] = useState<unknown>(null);
  const [model, setModel] = useState<OrganizationAccessAdminTransport | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // VISUAL_OWNER_REVIEW_REQUIRED (V1): the one-time link panel has no accepted WorkOS-N frame yet.
  const [onceLink, setOnceLink] = useState<{ email: string; url: string; expiresAt: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [roleChoice, setRoleChoice] = useState("");
  const [events, setEvents] = useState<AccessEvent[] | null>(null);

  const loadState = admin.status === "error" && !admin.data ? "error" : admin.data ? "ready" : "loading";

  if (admin.data && admin.data !== source) {
    setSource(admin.data);
    setModel(admin.data);
    setErrorMessage(null);
  } else if (admin.status === "error" && !admin.data && source !== "error") {
    setSource("error");
    setErrorMessage("Lista de acces nu este disponibilă.");
  }

  function applyAdmin(next: OrganizationAccessAdminTransport): void {
    setSource(next);
    setModel(next);
    writeResource(resourceKeys.organizationAccessAdmin(), next);
    invalidateAfterOrganizationAccessChange();
  }

  function openDialog(next: Dialog): void {
    setSaveState("idle");
    setErrorMessage(null);
    setNotice(null);
    setDialog(next);
  }

  /** One response path for every access action: apply the fresh list or keep the refusal in the dialog. */
  async function run(action: () => Promise<JsonResult>, fallback: string, onSuccess: (body: Record<string, unknown>) => void): Promise<void> {
    setSaveState("pending");
    setErrorMessage(null);
    const result = await action();
    if (result.ok) {
      const body = (result.body ?? {}) as Record<string, unknown>;
      const presented = presentOrganizationAccessAdmin(body);
      if (presented) applyAdmin(presented);
      setSaveState("success");
      onSuccess(body);
      setDialog(null);
      return;
    }
    setSaveState("error");
    setErrorMessage(adminFailureContent(describeAdminFailure(result.status, result.body, ACCESS_CODES, fallback)));
  }

  const pending = saveState === "pending";
  const canManage = Boolean(model?.canManage);
  const active = model?.members.filter((member) => member.active) ?? [];
  const inactive = model?.members.filter((member) => !member.active) ?? [];
  const assignable = (model?.roles ?? []).filter((role) => role.assignable);

  function memberRow(member: OrganizationAccessMember) {
    return (
      <li key={member.membershipId} className="adm-member" data-muted={!member.active || undefined}>
        <span className="adm-member__identity">
          <strong>{member.email}</strong>
          <span>
            {member.roleLabel} · de la {formatTimestamp(member.createdAt)}
            {member.active && !member.emailVerified ? " · email neverificat" : ""}
          </span>
          {member.lastActiveOwner ? (
            <span className="acc-note">Ultimul proprietar activ: nu poate fi revocat sau retrogradat.</span>
          ) : null}
        </span>
        <span className="adm-chip">{member.statusLabel}</span>
        {canManage && member.active && !member.lastActiveOwner ? (
          <span className="adm-member__actions">
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setRoleChoice(member.role);
                openDialog({ kind: "role", member });
              }}
            >
              Schimbă rolul
            </Button>
            {model?.emailDeliveryAvailable && member.emailVerified ? (
              <Button variant="secondary" disabled={pending} onClick={() => openDialog({ kind: "recovery", member })}>
                Trimite link de recuperare
              </Button>
            ) : null}
            <Button variant="secondary" disabled={pending} onClick={() => openDialog({ kind: "revoke", member })}>
              Revocă
            </Button>
          </span>
        ) : (
          <span />
        )}
      </li>
    );
  }

  function invitationRow(invitation: OrganizationAccessInvitation) {
    return (
      <li key={invitation.invitationId} className="adm-member">
        <span className="adm-member__identity">
          <strong>{invitation.email}</strong>
          <span>
            {invitation.roleLabel} · expiră {formatTimestamp(invitation.expiresAt)}
            {invitation.createdByEmail ? ` · trimisă de ${invitation.createdByEmail}` : ""}
          </span>
        </span>
        <span className="adm-chip" data-tone={invitation.deliveryStatus === "FAILED" ? "warning" : undefined}>
          {invitation.deliveryLabel}
        </span>
        <span className="adm-member__actions">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setNotice(null);
              void run(
                () => resendOrganizationInvitation(invitation.invitationId),
                "Invitația nu a putut fi retrimisă.",
                (body) => {
                  const url = typeof body.inviteUrl === "string" ? body.inviteUrl : null;
                  if (url) setOnceLink({ email: invitation.email, url, expiresAt: String((body.invitation as Record<string, unknown>)?.expiresAt ?? "") });
                  else setNotice(`Invitația a fost retrimisă către ${invitation.email}.`);
                },
              );
            }}
          >
            {model?.emailDeliveryAvailable ? "Retrimite" : "Link nou"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => openDialog({ kind: "revoke-invitation", invitation })}>
            Revocă invitația
          </Button>
        </span>
      </li>
    );
  }

  return (
    <AdminLayout
      current="access"
      title="Acces organizație"
      lead="Cine se poate autentifica în organizație și cu ce rol. Conturile de producție (oameni și PIN) rămân separate, la Oameni."
      meta={presentAdminEditMeta({
        settled: loadState === "ready" && model !== null,
        canEdit: canManage,
        whenEditable: "Doar proprietarul poate invita, schimba rolul sau revoca accesul.",
        whenReadOnly: "Editarea nu este disponibilă pentru acest rol.",
      })}
      action={
        canManage ? (
          <Button
            disabled={pending}
            onClick={() => {
              setInviteEmail("");
              setInviteRole("");
              openDialog({ kind: "invite" });
            }}
          >
            Invită utilizator
          </Button>
        ) : undefined
      }
    >
      {loadState === "loading" ? <LoadingFloor variant="admin" label="Se încarcă accesul organizației" /> : null}
      {loadState === "error" && errorMessage ? (
        <InlineAlert tone="error" title="Încărcarea a eșuat">
          {errorMessage}
        </InlineAlert>
      ) : null}
      {loadState === "ready" && model ? (
        <>
          <div aria-live="polite">
            {notice ? (
              <InlineAlert tone="success" title="Acces actualizat">
                {notice}
              </InlineAlert>
            ) : null}
          </div>
          {onceLink ? (
            <section className="acc-once" aria-labelledby="acc-once-title" data-visual-review="required">
              <h2 id="acc-once-title" className="acc-once__title">
                Linkul de invitație pentru {onceLink.email}
              </h2>
              <p className="acc-once__warning">
                Linkul nu va mai fi afișat. Trimite-l doar persoanei invitate, pe un canal de încredere. Expiră la{" "}
                {formatTimestamp(onceLink.expiresAt)}.
              </p>
              <div className="acc-once__row">
                <label className="adm-visually-hidden" htmlFor="acc-once-link">
                  Link de invitație
                </label>
                <input id="acc-once-link" className="adm-input" readOnly value={onceLink.url} onFocus={(event) => event.currentTarget.select()} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(onceLink.url).then(() => setNotice("Linkul a fost copiat."));
                  }}
                >
                  Copiază linkul
                </Button>
                <Button variant="ghost" onClick={() => setOnceLink(null)}>
                  Am trimis linkul
                </Button>
              </div>
            </section>
          ) : null}
          {saveState === "error" && errorMessage && !dialog ? (
            <InlineAlert tone="error" title="Operația a eșuat">
              {errorMessage}
            </InlineAlert>
          ) : null}
          {!canManage ? <AdminReadOnlyNote>Poți vedea utilizatorii, dar doar proprietarul poate administra accesul.</AdminReadOnlyNote> : null}
          <AdminSection title="Utilizatori cu acces" description="Fiecare utilizator are un singur rol în această organizație.">
            {active.length === 0 ? (
              <p>Niciun utilizator activ.</p>
            ) : (
              <ul className="adm-members" aria-label="Utilizatori">
                {active.map(memberRow)}
              </ul>
            )}
          </AdminSection>
          {canManage ? (
            <AdminSection
              title="Invitații în așteptare"
              description={
                model.emailDeliveryAvailable
                  ? "Invitațiile se trimit pe email. Linkul expiră după 7 zile și poate fi folosit o singură dată."
                  : "Fără trimitere pe email: copiezi linkul o singură dată și îl trimiți persoanei invitate. Linkul expiră după 7 zile."
              }
            >
              {model.invitations.length === 0 ? (
                <p>Nicio invitație în așteptare.</p>
              ) : (
                <ul className="adm-members" aria-label="Invitații în așteptare">
                  {model.invitations.map(invitationRow)}
                </ul>
              )}
            </AdminSection>
          ) : null}
          {inactive.length > 0 ? (
            <AdminSection title="Acces revocat" description="Rămân în listă pentru istoric. Un utilizator revocat poate fi invitat din nou, cu un rol nou.">
              <ul className="adm-members" aria-label="Acces revocat">
                {inactive.map(memberRow)}
              </ul>
            </AdminSection>
          ) : null}
          <AdminSection title="Roluri și drepturi" description="Rolurile sunt aceleași pentru toate organizațiile; drepturile sunt verificate de server.">
            <dl className="acc-roles" data-visual-review="required">
              {model.roles.map((role) => (
                <div key={role.role} className="acc-roles__row">
                  <dt>
                    {role.label}
                    {!role.assignable ? <span className="acc-roles__off"> · încă neactivat</span> : null}
                  </dt>
                  <dd>
                    <span>{role.summary}</span>
                    {role.cannot && role.cannot !== "—" ? <span className="acc-roles__cannot">{role.cannot}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </AdminSection>
          {canManage ? (
            <AdminSection title="Istoric acces" description="Ultimele 50 de acțiuni de acces din organizație.">
              <details
                className="adm-support"
                onToggle={(event) => {
                  if ((event.currentTarget as HTMLDetailsElement).open && events === null) {
                    void fetchOrganizationAccessEvents()
                      .then((body) => setEvents(((body as { events?: AccessEvent[] }).events ?? [])))
                      .catch(() => setEvents([]));
                  }
                }}
              >
                <summary>Arată istoricul</summary>
                <div className="adm-support__body">
                  {events === null ? (
                    <p>Se încarcă…</p>
                  ) : events.length === 0 ? (
                    <p>Nicio acțiune înregistrată.</p>
                  ) : (
                    <ul className="acc-events">
                      {events.map((event) => (
                        <li key={event.eventId}>
                          <span>{EVENT_LABELS[event.action] ?? "Acțiune de acces"}</span>
                          <span>
                            {event.subjectEmail ?? ""}
                            {event.actorEmail ? ` · de ${event.actorEmail}` : ""} · {formatTimestamp(event.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            </AdminSection>
          ) : null}
          <AdminSection title="Recuperarea accesului" description="Parola aparține utilizatorului; proprietarul nu o setează și nu o vede.">
            <p className="acc-help">
              {model.emailDeliveryAvailable
                ? "Utilizatorul își poate reseta singur parola din ecranul de autentificare („Am uitat parola”), dacă emailul lui este verificat. Poți trimite și tu un link de recuperare pe adresa lui verificată."
                : "Trimiterea pe email nu este activă. Un utilizator care și-a pierdut parola cere ajutorul suportului WorkOS, care îi verifică identitatea și îi trimite direct un link valabil o oră."}
            </p>
          </AdminSection>
        </>
      ) : null}

      {dialog?.kind === "invite" ? (
        <AdminConfirmDialog
          title="Invită utilizator"
          confirmLabel="Trimite invitația"
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            if (!inviteRole) {
              setSaveState("error");
              setErrorMessage("Alege rolul utilizatorului.");
              return;
            }
            const email = inviteEmail.trim();
            void run(() => inviteOrganizationUser(email, inviteRole), "Invitația nu a putut fi creată.", (body) => {
              const url = typeof body.inviteUrl === "string" ? body.inviteUrl : null;
              const expiresAt = String((body.invitation as Record<string, unknown>)?.expiresAt ?? "");
              if (url) setOnceLink({ email, url, expiresAt });
              else setNotice(`Invitația a fost trimisă pe email către ${email}.`);
            });
          }}
          onCancel={() => setDialog(null)}
        >
          <div className="acc-form">
            <label className="adm-field__label" htmlFor="acc-invite-email">
              Email
            </label>
            <input
              id="acc-invite-email"
              className="adm-input"
              type="email"
              autoComplete="off"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
            <p className="adm-field__label">Rol</p>
            <AdminPolicyOptions
              name="acc-invite-role"
              legend="Rol"
              options={assignable.map((role) => ({ value: role.role, label: role.label, description: `${role.summary} ${role.cannot !== "—" ? role.cannot : ""}`.trim() }))}
              value={inviteRole}
              activeValue={null}
              onChange={setInviteRole}
            />
          </div>
        </AdminConfirmDialog>
      ) : null}

      {dialog?.kind === "role" ? (
        <AdminConfirmDialog
          title={`Schimbă rolul pentru ${dialog.member.email}`}
          confirmLabel="Schimbă rolul"
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            const member = dialog.member;
            void run(() => changeOrganizationMemberRole(member.membershipId, roleChoice), "Rolul nu a putut fi schimbat.", () => {
              setNotice(`Rolul lui ${member.email} a fost schimbat. Se aplică de la următoarea acțiune a utilizatorului.`);
            });
          }}
          onCancel={() => setDialog(null)}
        >
          <AdminPolicyOptions
            name="acc-role"
            legend="Rol nou"
            options={assignable.map((role) => ({ value: role.role, label: role.label, description: `${role.summary} ${role.cannot !== "—" ? role.cannot : ""}`.trim() }))}
            value={roleChoice}
            activeValue={dialog.member.role}
            onChange={setRoleChoice}
          />
        </AdminConfirmDialog>
      ) : null}

      {dialog?.kind === "revoke" ? (
        <AdminConfirmDialog
          title={`Revoci accesul pentru ${dialog.member.email}?`}
          confirmLabel="Revocă accesul"
          danger
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            const member = dialog.member;
            void run(() => revokeOrganizationAccessMembership(member.membershipId), "Accesul nu a putut fi revocat.", () => {
              setNotice(`${member.email} nu se mai poate autentifica în organizație.`);
            });
          }}
          onCancel={() => setDialog(null)}
        >
          <p>Nu se va mai putea autentifica în organizație; sesiunile lui de aici se închid.</p>
          <p>Lucrările, ofertele și istoricul la care a participat rămân neschimbate.</p>
        </AdminConfirmDialog>
      ) : null}

      {dialog?.kind === "recovery" ? (
        <AdminConfirmDialog
          title={`Trimiți un link de recuperare lui ${dialog.member.email}?`}
          confirmLabel="Trimite linkul"
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            const member = dialog.member;
            void run(() => requestMemberRecovery(member.membershipId), "Linkul nu a putut fi trimis.", () => {
              setNotice(`Am trimis un link de recuperare pe adresa verificată a lui ${member.email}.`);
            });
          }}
          onCancel={() => setDialog(null)}
        >
          <p>Linkul este valabil o oră și ajunge doar pe adresa verificată a utilizatorului. Tu nu vei vedea linkul.</p>
        </AdminConfirmDialog>
      ) : null}

      {dialog?.kind === "revoke-invitation" ? (
        <AdminConfirmDialog
          title={`Revoci invitația pentru ${dialog.invitation.email}?`}
          confirmLabel="Revocă invitația"
          danger
          busy={pending}
          error={saveState === "error" ? errorMessage : null}
          onConfirm={() => {
            const invitation = dialog.invitation;
            void run(() => revokeOrganizationInvitation(invitation.invitationId), "Invitația nu a putut fi revocată.", () => {
              setNotice(`Invitația pentru ${invitation.email} nu mai este valabilă.`);
            });
          }}
          onCancel={() => setDialog(null)}
        >
          <p>Linkul trimis nu va mai funcționa.</p>
        </AdminConfirmDialog>
      ) : null}
    </AdminLayout>
  );
}

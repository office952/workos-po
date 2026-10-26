import { useId } from "react";
import type { MouseEvent } from "react";
import { navigate } from "../../../../routing/navigate";
import { useDisclosure } from "../bandModel";
import { DossierIcon } from "../dossierIcons";
import type { ClientContact, ClientContacts as Contacts } from "./contactsModel";

function ContactWays({ contact, inline = false }: { contact: ClientContact; inline?: boolean }) {
  const ways = [contact.phone, contact.email].filter((way): way is { value: string; href: string } => way !== null);
  if (!ways.length) return null;
  return (
    <p className="cdh-contact__ways" data-inline={inline || undefined}>
      {ways.map((way, index) => (
        <span key={way.href}>
          {index > 0 ? <span className="cdh-contact__sep" aria-hidden="true">·</span> : null}
          <a href={way.href}>{way.value}</a>
        </span>
      ))}
    </p>
  );
}

/** R1 (846:31701): the ways of the principal contact one under the other, each with its icon. */
function ContactLines({ contact }: { contact: ClientContact }) {
  return (
    <>
      {contact.phone ? (
        <a className="cdh-contact__way" href={contact.phone.href}>
          <DossierIcon name="phone" size={13} />
          {contact.phone.value}
        </a>
      ) : null}
      {contact.email ? (
        <a className="cdh-contact__way" data-way="email" href={contact.email.href}>
          <DossierIcon name="mail" size={13} />
          {contact.email.value}
        </a>
      ) : null}
    </>
  );
}

function initials(name: string | null): string {
  const words = (name ?? "").split(/\s+/).filter(Boolean);
  return words.length ? words.slice(0, 2).map((word) => word[0]!.toLocaleUpperCase("ro")).join("") : "–";
}

function contactName(contact: ClientContact): string {
  return [contact.name, contact.role].filter(Boolean).join(" · ") || "Persoană necompletată";
}

/**
 * The principal contact and "Toate contactele · N ▾" (Figma 574:2203, panel 579:5369). The panel
 * lists every contact the client has (principal from the client record; commercial and billing
 * from the commercial terms), the address and what is still empty. Escape or a click elsewhere
 * closes it and the focus goes back to the button.
 */
export function ClientContacts({
  contacts,
  variant,
  editHref,
}: {
  contacts: Contacts;
  variant: "column" | "line" | "card";
  /** Where the commercial and billing contacts are changed (only with the permission). */
  editHref: string | null;
}) {
  const { open, setOpen, rootRef, buttonRef, onKeyDown } = useDisclosure();
  const panelId = useId();
  const principal = contacts.principal;
  const total = contacts.all.length;
  const toggleLabel = variant === "column" ? `Toate contactele (${total})` : `Toate (${total})`;
  const goEdit = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!editHref || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setOpen(false);
    navigate(editHref);
  };

  return (
    <div className="cdh-contacts" data-variant={variant} ref={rootRef} onKeyDown={onKeyDown}>
      {variant === "line" ? <span className="cdh-contacts__kicker">Contact</span> : null}
      {variant === "column" ? (
        // R1 contact card (846:31701): initials, name and role, then the ways and "Toate contactele (N)".
        <>
          <span className="cdh-contacts__avatar" aria-hidden="true">{initials(principal?.name ?? null)}</span>
          <div className="cdh-contact" data-variant="column">
            <p className="u-visually-hidden">Contact principal</p>
            <p className="cdh-contact__name">{principal ? principal.name ?? "Persoană necompletată" : "Fără persoană de contact"}</p>
            {principal?.role ? <p className="cdh-contact__role">{principal.role}</p> : null}
          </div>
          <div className="cdh-contacts__ways">
            {principal ? <ContactLines contact={principal} /> : null}
            {principal && !principal.email ? <span className="cdh-contact__missing" data-way={principal.phone ? "email" : undefined}>{principal.phone ? "e-mail necompletat" : "telefon și e-mail necompletate"}</span> : null}
            {total > 0 || contacts.missing.length ? (
              <button type="button" ref={buttonRef} className="cdh-contacts__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
                <span>{total > 0 ? toggleLabel : "Contacte"}</span>
                <DossierIcon name={open ? "chevronUp" : "chevronDown"} size={12} />
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {principal ? (
            <div className="cdh-contact" data-variant={variant}>
              <p className="cdh-contact__name">{principal.name ?? "Persoană necompletată"}</p>
              {variant === "card" ? (principal.phone ? <p className="cdh-contact__ways"><a href={principal.phone.href}>{principal.phone.value}</a></p> : null) : <ContactWays contact={principal} inline={variant === "line"} />}
            </div>
          ) : (
            <p className="cdh-contact__none">Fără persoană de contact</p>
          )}
          {total > 0 || contacts.missing.length ? (
            <button type="button" ref={buttonRef} className="cdh-contacts__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
              <span>{total > 0 ? toggleLabel : "Contacte"}</span>
              <DossierIcon name={open ? "chevronUp" : "chevronDown"} size={12} />
            </button>
          ) : null}
        </>
      )}
      {open ? (
        <div id={panelId} className="cdh-panel" role="region" aria-label="Contactele clientului">
          {contacts.all.map((contact) => (
            <div key={contact.key} className="cdh-panel__group">
              <p className="cdh-panel__kicker">{contact.label}</p>
              <p className="cdh-panel__name">{contactName(contact)}</p>
              <ContactWays contact={contact} inline />
            </div>
          ))}
          {contacts.address ? (
            <div className="cdh-panel__group">
              <p className="cdh-panel__kicker">Adresă</p>
              <p className="cdh-panel__text">{contacts.address}</p>
            </div>
          ) : null}
          {contacts.missing.length ? <p className="cdh-panel__missing">{`Necompletat în fișa clientului: ${contacts.missing.join(", ")}.`}</p> : null}
          {editHref ? (
            <a className="cdh-panel__edit" href={editHref} onClick={goEdit}>
              Modifică în Date comerciale
              <DossierIcon name="right" size={13} />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

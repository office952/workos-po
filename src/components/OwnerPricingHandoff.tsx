import { InlineAlert } from "./InlineAlert";

/**
 * Commercial Role Clarity V1 · continuation for a user who prepared the configuration but may not
 * set the client price (OWNER_ONLY offering policy, or no pricing right).
 *
 * It states the existing contract only: the server reason, who prices and freezes, where to go
 * next and what happens afterwards. There is no hand-over action, notification or saved draft
 * behind it, so the panel does not promise one: an unfrozen configuration lives in this browser
 * tab until a quote is frozen.
 */
export function OwnerPricingHandoff({
  reason,
  backHref,
  backLabel,
  saved = false,
}: {
  reason: string | null;
  backHref: string | null;
  backLabel: string;
  /** Commercial Continuity V2: the configuration is a saved quote variant on the request. */
  saved?: boolean;
}) {
  if (saved) {
    // The hand-over is a state of the request: the Owner finds the saved variant and continues it.
    return (
      <div className="stack" data-testid="owner-pricing-handoff">
        <InlineAlert tone="pending" title="Configurația este salvată. Prețul îl stabilește Proprietarul">
          <p>{reason ?? "Prețul și emiterea acestei oferte sunt stabilite de Proprietar."}</p>
        </InlineAlert>
        <ol className="owner-pricing-handoff__steps">
          <li>
            <strong>Tu:</strong> ai confirmat configurația. Este salvată pe cerere; poți închide pagina.
          </li>
          <li>
            <strong>Proprietarul:</strong> deschide varianta de pe cerere, vede valorile tale, stabilește
            prețul net și emite oferta. Nu reintroduce nimic.
          </li>
          <li>
            <strong>După emitere:</strong> oferta apare pe cerere; o poți deschide și urmări
            rezultatul comercial.
          </li>
        </ol>
        {backHref ? (
          <p>
            <a className="text-link" href={backHref}>
              {backLabel}
            </a>
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="stack" data-testid="owner-pricing-handoff">
      <InlineAlert tone="pending" title="Configurația este gata. Prețul îl stabilește Proprietarul">
        <p>{reason ?? "Prețul și înghețarea acestei oferte sunt stabilite de Proprietar."}</p>
      </InlineAlert>
      <ol className="owner-pricing-handoff__steps">
        <li>
          <strong>Tu:</strong> ai confirmat configurația. Nu introduci prețul și nu îngheți oferta.
        </li>
        <li>
          <strong>Proprietarul:</strong> deschide aceeași cerere, configurează produsul, stabilește
          prețul net și îngheață oferta. Până atunci, cererea nu are o ofertă înghețată.
        </li>
        <li>
          <strong>După înghețare:</strong> oferta apare pe cerere; o poți deschide și urmări
          rezultatul comercial.
        </li>
      </ol>
      <p className="ui-note">
        Valorile configurației rămân doar în această filă până la înghețarea ofertei; nu sunt
        transmise automat Proprietarului.
      </p>
      {backHref ? (
        <p>
          <a className="text-link" href={backHref}>
            {backLabel}
          </a>
        </p>
      ) : null}
    </div>
  );
}

import type { QuoteDecisionMode } from "./quoteDecisionMode";

export function QuoteDecisionNote({ mode, permission }: { mode: QuoteDecisionMode; permission: string }) {
  return (
    <section className="quote-decision" aria-label="Decizia ofertei" data-mode={mode}>
      {mode === "ordered" ? (
        <p>Comanda creată nu înseamnă că producția a pornit. Trimiterea în producție rămâne un pas separat, în fișa lucrării.</p>
      ) : mode === "confirm-order" ? (
        <>
          <h2>Obligație deschisă</h2>
          <p>Clientul a acceptat oferta, dar comanda nu este confirmată. Fișa lucrării apare după confirmare.</p>
          <ul>
            <li>Confirmarea creează comanda din această versiune înghețată. Sumele rămân cele primite de la server.</li>
            <li>Producția nu pornește acum. Trimiterea în producție este un pas separat.</li>
          </ul>
        </>
      ) : mode === "accept" ? (
        <>
          <h2>Ce se întâmplă când accepți</h2>
          <ul>
            <li>Acceptarea creează comanda din această versiune înghețată. Sumele rămân cele primite de la server.</li>
            <li>Se deschide fișa lucrării în starea pe care o raportează serverul pentru comanda creată.</li>
            <li>Producția nu pornește acum. Trimiterea în producție este un pas separat.</li>
            <li>Configurația nu se schimbă în această ofertă.</li>
          </ul>
        </>
      ) : null}
      {mode === "ordered" ? null : <p>{permission}</p>}
    </section>
  );
}

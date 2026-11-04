export function QuoteDecisionNote({
  ordered,
  permission,
}: {
  ordered: boolean;
  permission: string;
}) {
  return (
    <section className="quote-decision" aria-label="Decizia ofertei">
      {ordered ? (
        <p>Comanda creată nu înseamnă că producția a pornit. Trimiterea în producție rămâne un pas separat, în fișa lucrării.</p>
      ) : (
        <>
          <h2>Ce se întâmplă când accepți</h2>
          <ul>
            <li>Acceptarea creează comanda din această versiune înghețată. Sumele rămân cele primite de la server.</li>
            <li>Se deschide fișa lucrării în starea pe care o raportează serverul pentru comanda creată.</li>
            <li>Producția nu pornește acum. Trimiterea în producție este un pas separat.</li>
            <li>Configurația nu se schimbă în această ofertă.</li>
          </ul>
        </>
      )}
      <p>{permission}</p>
    </section>
  );
}

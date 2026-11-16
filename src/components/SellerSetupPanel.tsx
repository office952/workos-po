import { InlineAlert } from "./InlineAlert";

/**
 * Commercial & Financial V1: the company identity is configured in one place, Administrare ›
 * Date firmă (validated and versioned). The configurator only explains what is missing and where
 * it is completed; the page itself is read-only for roles that cannot edit it.
 */
export function SellerSetupPanel() {
  return (
    <InlineAlert tone="blocked" title="Datele firmei emitente lipsesc">
      Oferta nu poate fi înghețată până când firma nu are cel puțin denumirea legală și identificatorul
      fiscal. Datele firmei se completează de Proprietar în{" "}
      <a className="text-link" href="/admin/company">
        Administrare › Date firmă
      </a>
      .
    </InlineAlert>
  );
}

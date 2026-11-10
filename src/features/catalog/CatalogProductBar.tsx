import { useEffect, useState, type ReactNode } from "react";
import type { CatalogWorkspaceProduct } from "../../adapters/catalogCapabilitiesAdapter";
import { CatalogLink } from "./CatalogLink";
import type { CatalogSelection } from "./catalogSelection";

export type CatalogRenameState = {
  value: string;
  pending: boolean;
  error: string | null;
  conflict: boolean;
};

type CatalogProductBarProps = {
  product: CatalogWorkspaceProduct;
  canRename: boolean;
  readOnly: boolean;
  rename: CatalogRenameState | null;
  onRenameStart: () => void;
  onRenameChange: (value: string) => void;
  onRenameSave: () => void;
  onRenameCancel: () => void;
  onRenameReload: () => void;
  onNavigate: (selection: CatalogSelection) => void;
  switcher: ReactNode;
  tabs: ReactNode;
};

/** Same breakpoint as the phone rules in catalog-v2.css. */
const PHONE_QUERY = "(max-width: 767px)";

function resolvePhoneBar(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

/** The phone bar has its own reading and focus order, so it is a separate structure, not a restyle. */
function usePhoneBar(): boolean {
  const [phone, setPhone] = useState(resolvePhoneBar);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return phone;
}

/** Compact product identity: where am I, which product, how do I change it. */
export function CatalogProductBar({
  product,
  canRename,
  readOnly,
  rename,
  onRenameStart,
  onRenameChange,
  onRenameSave,
  onRenameCancel,
  onRenameReload,
  onNavigate,
  switcher,
  tabs,
}: CatalogProductBarProps) {
  const phone = usePhoneBar();
  const library: CatalogSelection = { productCode: null, componentId: null, tab: "constructie" };
  const version = product.templateVersion ? `versiunea ${product.templateVersion}` : null;
  const tags = (
    <>
      <span className={`catv2-tag catv2-tag--${product.enablementTone}`}>{product.enablementLabel}</span>
      {readOnly ? <span className="catv2-tag catv2-tag--quiet">Doar consultare</span> : null}
    </>
  );
  const name = rename === null ? (
    <h1 className="catv2-bar__title">{product.label}</h1>
  ) : (
    <form
      className="catv2-rename"
      onSubmit={(event) => {
        event.preventDefault();
        onRenameSave();
      }}
    >
      <label className="catv2-field" htmlFor="product-label">
        <span className="catv2-field__label">Denumirea produsului</span>
        <input
          id="product-label"
          className="catv2-field__control"
          value={rename.value}
          disabled={rename.pending}
          aria-invalid={rename.error !== null}
          aria-describedby={rename.error ? "product-label-error" : undefined}
          onChange={(event) => onRenameChange(event.target.value)}
        />
      </label>
      {rename.error ? <p className="catv2-field__error" id="product-label-error" role="alert">{rename.error}</p> : null}
      <div className="catv2-actions">
        {rename.conflict ? (
          <button type="button" className="catv2-button catv2-button--secondary" disabled={rename.pending} onClick={onRenameReload}>Reîncarcă denumirea</button>
        ) : (
          <button type="submit" className="catv2-button catv2-button--primary" disabled={rename.pending || !rename.value.trim()}>Salvează denumirea</button>
        )}
        <button type="button" className="catv2-button catv2-button--quiet" disabled={rename.pending} onClick={onRenameCancel}>Renunță</button>
      </div>
    </form>
  );

  if (phone) {
    // Two levels: where to go (library, another product), then what this is (name, state).
    return (
      <header className="catv2-bar" data-layout="phone">
        <div className="catv2-bar__nav">
          <CatalogLink className="catv2-link catv2-bar__back" selection={library} onNavigate={onNavigate} label="Bibliotecă de produse">
            <span aria-hidden="true">‹</span> Bibliotecă
          </CatalogLink>
          {switcher}
        </div>
        <div className="catv2-bar__name">
          {name}
          {canRename && rename === null ? (
            <button type="button" className="catv2-bar__edit" aria-label="Editează denumirea" title="Editează denumirea" onClick={onRenameStart}>
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M3.5 16.5h3l8.6-8.6-3-3-8.6 8.6z" />
                <path d="M10.6 6.4l3 3" />
              </svg>
            </button>
          ) : null}
        </div>
        <p className="catv2-bar__crumb">
          {version ? <span className="catv2-bar__kind">{version}</span> : null}
          {tags}
        </p>
        {tabs}
      </header>
    );
  }

  return (
    <header className="catv2-bar">
      <div className="catv2-bar__top">
        <div className="catv2-bar__identity">
          <p className="catv2-bar__crumb">
            <CatalogLink className="catv2-link catv2-bar__back" selection={library} onNavigate={onNavigate} label="Catalog, biblioteca de produse">
              Catalog
            </CatalogLink>
            <span className="catv2-bar__sep" aria-hidden="true">/</span>
            <span className="catv2-bar__kind">Definiție de produs{version ? ` · ${version}` : ""}</span>
            {tags}
          </p>
          {name}
        </div>
        <div className="catv2-bar__actions">
          {canRename && rename === null ? (
            <button type="button" className="catv2-button catv2-button--quiet" onClick={onRenameStart}>Editează denumirea</button>
          ) : null}
          {switcher}
        </div>
      </div>
      {tabs}
    </header>
  );
}

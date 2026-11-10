import type { ReactNode } from "react";
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
  const library: CatalogSelection = { productCode: null, componentId: null, tab: "constructie" };
  return (
    <header className="catv2-bar">
      <div className="catv2-bar__top">
        <div className="catv2-bar__identity">
          <p className="catv2-bar__crumb">
            <CatalogLink className="catv2-link catv2-bar__back" selection={library} onNavigate={onNavigate} label="Catalog, biblioteca de produse">
              <span className="catv2-bar__back-wide">Catalog</span>
              <span className="catv2-bar__back-phone" aria-hidden="true">‹ Bibliotecă</span>
            </CatalogLink>
            <span className="catv2-bar__sep" aria-hidden="true">/</span>
            <span className="catv2-bar__kind">
              <span className="catv2-bar__kind-wide">Definiție de produs{product.templateVersion ? " · " : ""}</span>
              {product.templateVersion ? `versiunea ${product.templateVersion}` : null}
            </span>
            <span className={`catv2-tag catv2-tag--${product.enablementTone}`}>{product.enablementLabel}</span>
            {readOnly ? <span className="catv2-tag catv2-tag--quiet">Doar consultare</span> : null}
          </p>
          {rename === null ? (
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
          )}
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

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "../components/Button";
import { CreationDialog } from "../components/CreationDialog";
import { InlineAlert } from "../components/InlineAlert";

/**
 * R3 · shared Administration parts. Presentation only: values, permissions, versions and refusals
 * come from the API as before; these parts only show them the same way on every page.
 */

export function AdminSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={["adm-section", className].filter(Boolean).join(" ")} aria-labelledby={id}>
      <div className="adm-section__head">
        <h2 id={id} className="adm-section__title">
          {title}
        </h2>
        {action ? <div className="adm-section__action">{action}</div> : null}
      </div>
      {description ? <p className="adm-section__description">{description}</p> : null}
      {children}
    </section>
  );
}

/** Form column + context column (La salvare, istoric). Stacks under 1100px. */
export function AdminColumns({ main, aside }: { main: ReactNode; aside?: ReactNode }) {
  return (
    <div className="adm-columns">
      <div className="adm-columns__main">{main}</div>
      {aside ? <aside className="adm-columns__aside">{aside}</aside> : null}
    </div>
  );
}

type AdminFieldProps = {
  id: string;
  label: string;
  help?: ReactNode;
  value: string;
  onChange?: (value: string) => void;
  unit?: string;
  /** The saved value; when the draft differs the row is marked and shows „era …”. */
  baseline?: string;
  error?: string | null;
  readOnly?: boolean;
  disabled?: boolean;
  inputMode?: "decimal" | "numeric" | "text";
  /** Accessible name when the visible label is not enough. */
  ariaLabel?: string;
  /**
   * "value" (default): short numeric value aligned right, as on every existing page.
   * "text": long free text (names, addresses, identifiers) taking the full value column.
   */
  variant?: "value" | "text";
};

export function AdminField({
  id,
  label,
  help,
  value,
  onChange,
  unit,
  baseline,
  error,
  readOnly = false,
  disabled = false,
  inputMode = "text",
  ariaLabel,
  variant = "value",
}: AdminFieldProps) {
  const modified = !readOnly && baseline !== undefined && value !== baseline;
  const helpId = help ? `${id}-help` : undefined;
  const noteId = modified || error ? `${id}-note` : undefined;
  return (
    <div
      className="adm-field"
      data-state={error ? "error" : modified ? "modified" : readOnly ? "read-only" : "normal"}
      data-variant={variant === "text" ? "text" : undefined}
    >
      <div className="adm-field__copy">
        {readOnly ? (
          <span className="adm-field__label" id={`${id}-label`}>
            {label}
          </span>
        ) : (
          <label className="adm-field__label" htmlFor={id}>
            {modified ? <span className="adm-dot" aria-hidden="true" /> : null}
            {label}
          </label>
        )}
        {help ? (
          <p className="adm-field__help" id={helpId}>
            {help}
          </p>
        ) : null}
      </div>
      <div className="adm-field__value">
        <div className="adm-field__control">
          {readOnly ? (
            <span className="adm-field__readonly" aria-labelledby={`${id}-label`}>
              {value || "—"}
            </span>
          ) : (
            <input
              id={id}
              className={variant === "text" ? "adm-input adm-input--text" : "adm-input adm-input--value"}
              value={value}
              inputMode={inputMode}
              disabled={disabled}
              aria-label={ariaLabel}
              title={variant === "text" && value ? value : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={[helpId, noteId].filter(Boolean).join(" ") || undefined}
              onChange={(event) => onChange?.(event.target.value)}
            />
          )}
          {unit ? <span className="adm-field__unit">{unit}</span> : null}
        </div>
        {error ? (
          <p className="adm-field__note adm-field__note--error" id={noteId}>
            {error}
          </p>
        ) : modified ? (
          <p className="adm-field__note" id={noteId}>
            era {baseline || "gol"}
            {unit ? ` ${unit}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The unsaved-changes bar. Appears only while a draft exists; „Renunță” restores the saved values. */
export function AdminChangeBar({
  title,
  detail,
  onDiscard,
  onSave,
  saveLabel = "Revizuiește și salvează",
  pending = false,
  saveDisabled = false,
}: {
  title: string;
  detail?: string;
  onDiscard: () => void;
  onSave: () => void;
  saveLabel?: string;
  pending?: boolean;
  saveDisabled?: boolean;
}) {
  return (
    <div className="adm-change-bar" role="region" aria-label="Modificări nesalvate">
      <div className="adm-change-bar__copy">
        <p className="adm-change-bar__title">{title}</p>
        {detail ? <p className="adm-change-bar__detail">{detail}</p> : null}
      </div>
      <div className="adm-change-bar__actions">
        <Button variant="secondary" disabled={pending} onClick={onDiscard}>
          Renunță
        </Button>
        <Button disabled={pending || saveDisabled} onClick={onSave}>
          {pending ? "Se salvează…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}

export type AdminVersionRow = {
  key: string;
  version: string;
  active: boolean;
  when: string | null;
  detail?: string | null;
};

export function AdminVersionList({
  title = "Istoric versiuni",
  rows,
  emptyText,
  highlightActive = false,
}: {
  title?: string;
  rows: AdminVersionRow[];
  emptyText: string;
  highlightActive?: boolean;
}) {
  return (
    <div className="adm-versions">
      <h3 className="adm-context__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="adm-context__text">{emptyText}</p>
      ) : (
        <ul className="adm-versions__list" aria-label={title}>
          {rows.map((row) => (
            <li
              key={row.key}
              className="adm-versions__row"
              data-active={row.active ? "true" : undefined}
              data-highlight={highlightActive && row.active ? "true" : undefined}
            >
              <span className="adm-versions__version">{row.version}</span>
              <span className="adm-versions__detail">
                {row.active ? <span className="adm-versions__active">activă</span> : null}
                {[row.when, row.detail].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminContextBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="adm-context">
      <h3 className="adm-context__title">{title}</h3>
      {children}
    </div>
  );
}

export function AdminBullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="adm-bullets">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Registry (list) + detail. The detail keeps its place when the selection changes. */
export function AdminRegistry({ list, detail, label }: { list: ReactNode; detail: ReactNode; label: string }) {
  return (
    <div className="adm-registry">
      <div className="adm-registry__list" aria-label={label} role="region">
        {list}
      </div>
      <div className="adm-registry__detail">{detail}</div>
    </div>
  );
}

export function AdminRegistryRow({
  title,
  detail,
  status,
  selected = false,
  dirty = false,
  muted = false,
  indent = false,
  onSelect,
}: {
  title: string;
  detail?: string;
  status?: string;
  selected?: boolean;
  dirty?: boolean;
  muted?: boolean;
  indent?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="adm-row"
      data-selected={selected ? "true" : undefined}
      data-muted={muted ? "true" : undefined}
      data-indent={indent ? "true" : undefined}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="adm-row__copy">
        <span className="adm-row__title">{title}</span>
        {detail ? <span className="adm-row__detail">{detail}</span> : null}
      </span>
      {dirty ? (
        <span className="adm-row__status adm-row__status--dirty">
          <span className="adm-dot" aria-hidden="true" />
          nesalvat
        </span>
      ) : status ? (
        <span className="adm-row__status">{status}</span>
      ) : null}
    </button>
  );
}

/** Actions with consequences sit apart from saving, under a hairline, with their consequence. */
export function AdminConsequence({
  title,
  description,
  blockedReason,
  children,
}: {
  title: string;
  description: ReactNode;
  blockedReason?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className="adm-consequence">
      <h3 className="adm-consequence__title">{title}</h3>
      <p className="adm-consequence__text">{description}</p>
      {blockedReason ? (
        <p className="adm-consequence__blocked" role="note">
          {blockedReason}
        </p>
      ) : null}
      {children ? <div className="adm-consequence__actions">{children}</div> : null}
    </div>
  );
}

export function AdminDangerButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="hit adm-danger" disabled={disabled} onClick={onClick}>
      <span className="adm-danger__label">{children}</span>
    </button>
  );
}

/**
 * Confirmation for an action with effect. Names the object and the consequence the contract states;
 * never promises a way back the server does not offer. Initial focus: the safe choice.
 */
export function AdminConfirmDialog({
  title,
  subtitle,
  children,
  confirmLabel,
  cancelLabel = "Anulează",
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <CreationDialog title={title} subtitle={subtitle} busy={busy} onDismiss={onCancel}>
      <div className="adm-dialog">
        <div className="adm-dialog__body">{children}</div>
        {error ? (
          <InlineAlert tone="error" title="Operația a eșuat">
            {error}
          </InlineAlert>
        ) : null}
        <div className="adm-dialog__actions">
          <Button ref={cancelRef} variant="secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          {danger ? (
            <AdminDangerButton disabled={busy} onClick={onConfirm}>
              {busy ? "Se aplică…" : confirmLabel}
            </AdminDangerButton>
          ) : (
            <Button disabled={busy} onClick={onConfirm}>
              {busy ? "Se aplică…" : confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </CreationDialog>
  );
}

/**
 * Changing the selected object while a draft exists (R1 · F1–F3). The draft is never dropped
 * silently: save and open (only when the save can report success), discard and open, or stay.
 * Initial focus and Esc: stay.
 */
export function AdminSwitchDialog({
  subject,
  target,
  busy = false,
  error,
  onSave,
  onDiscard,
  onStay,
}: {
  /** What holds the draft, e.g. „Ana Pop”. */
  subject: string;
  /** What the owner wants to open next. */
  target: string;
  busy?: boolean;
  error?: ReactNode;
  onSave?: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    stayRef.current?.focus();
  }, []);
  return (
    <CreationDialog title={`Ai modificări nesalvate la ${subject}`} busy={busy} onDismiss={onStay}>
      <div className="adm-dialog">
        <div className="adm-dialog__body">
          <p>Alege ce faci înainte să deschizi {target}.</p>
        </div>
        {error ? (
          <InlineAlert tone="error" title="Salvarea a eșuat">
            {error} Valorile au rămas în formular.
          </InlineAlert>
        ) : null}
        <div className="adm-dialog__actions adm-dialog__actions--stack">
          {onSave ? (
            <Button disabled={busy} onClick={onSave}>
              {busy ? "Se salvează…" : "Salvează și deschide"}
            </Button>
          ) : null}
          <Button variant="secondary" disabled={busy} onClick={onDiscard}>
            Renunță și deschide
          </Button>
          <Button ref={stayRef} variant="ghost" disabled={busy} onClick={onStay}>
            Rămâi aici
          </Button>
        </div>
      </div>
    </CreationDialog>
  );
}

export type AdminReviewRow = { label: string; from: string; to: string };

/** Current → proposed, what stays, the effect the contract states; then save. */
export function AdminReviewDialog({
  title = "Revizuiește modificările",
  subtitle,
  rows,
  unchanged,
  effects,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  title?: string;
  subtitle?: string;
  rows: AdminReviewRow[];
  unchanged?: string | null;
  effects: readonly string[];
  confirmLabel: string;
  busy?: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AdminConfirmDialog
      title={title}
      subtitle={subtitle}
      confirmLabel={confirmLabel}
      cancelLabel="Înapoi la editare"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <table className="adm-review">
        <thead>
          <tr>
            <th scope="col">Valoare</th>
            <th scope="col">Acum</th>
            <th scope="col">Propus</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className="adm-review__from">{row.from}</td>
              <td className="adm-review__to">{row.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {unchanged ? <p className="adm-review__unchanged">{unchanged}</p> : null}
      {effects.length > 0 ? (
        <div className="adm-review__effect">
          <h3 className="adm-context__title">Efect</h3>
          <AdminBullets items={effects} />
        </div>
      ) : null}
    </AdminConfirmDialog>
  );
}

export type AdminPolicyOption = {
  value: string;
  label: string;
  description?: string;
};

/** A mode choice: radio rows; the active mode is named, the chosen one is marked. */
export function AdminPolicyOptions({
  name,
  legend,
  options,
  value,
  activeValue,
  disabled = false,
  onChange,
}: {
  name: string;
  legend: string;
  options: readonly AdminPolicyOption[];
  value: string;
  activeValue: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="adm-options" disabled={disabled}>
      <legend className="adm-visually-hidden">{legend}</legend>
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={id}
            className="adm-option"
            data-selected={option.value === value ? "true" : undefined}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className="adm-option__copy">
              <span className="adm-option__label">
                {option.label}
                {option.value === activeValue ? <span className="adm-option__active">activ acum</span> : null}
              </span>
              {option.description ? <span className="adm-option__description">{option.description}</span> : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Internal identifiers stay available for support, folded away from the operator's reading line. */
export function AdminSupportDetails({ children }: { children: ReactNode }) {
  return (
    <details className="adm-support">
      <summary>Detalii pentru suport</summary>
      <div className="adm-support__body">{children}</div>
    </details>
  );
}

export function AdminReadOnlyNote({ children }: { children: ReactNode }) {
  return (
    <span className="adm-readonly">
      <svg className="adm-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {children}
    </span>
  );
}

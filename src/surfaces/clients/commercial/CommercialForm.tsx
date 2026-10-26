import type { RefObject } from "react";
import type { CommercialTermsModel, DossierDocument } from "../../../adapters/customerDossierAdapter";
import { fieldError, FORM_GROUPS, type FormField, type TermsDraft } from "./termsModel";

export type FieldNote = { tone: "check" | "taken"; text: string };

/**
 * The form of Date comerciale (734:185; telefon 783:31001): four panels with the server's labels.
 * A field the server refused is marked with its message (721:412); after a conflict, a field both
 * people changed is marked to be checked and a field taken from the current version says so
 * (754:27045, 783:31053). The values are the reader's; nothing here checks them on its own.
 */
export function CommercialForm({
  idPrefix,
  model,
  draft,
  contracts,
  busy,
  invalidField,
  notes,
  firstFieldRef,
  onChange,
}: {
  idPrefix: string;
  model: CommercialTermsModel;
  draft: TermsDraft;
  contracts: DossierDocument[];
  busy: boolean;
  invalidField: string | null;
  notes: Record<string, FieldNote>;
  firstFieldRef?: RefObject<HTMLInputElement | null>;
  onChange: (key: string, value: string) => void;
}) {
  function control(field: FormField, describedBy: string | undefined, first: boolean) {
    const common = {
      id: `${idPrefix}-${field.key}`,
      name: field.key,
      value: draft[field.key] ?? "",
      // Read-only while saving: a field keeps the focus; nothing typed changes what is being sent.
      readOnly: busy,
      "aria-invalid": invalidField === field.key || undefined,
      "aria-describedby": describedBy,
    };
    const update = (value: string) => onChange(field.key, value);
    if (field.input === "notes") return <textarea {...common} rows={3} maxLength={2000} onChange={(event) => update(event.target.value)} />;
    if (field.input === "currency") {
      return (
        <select {...common} disabled={busy} onChange={(event) => update(event.target.value)}>
          <option value="">necompletat</option>
          {model.currencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
        </select>
      );
    }
    if (field.input === "document") {
      const current = draft[field.key] ?? "";
      const known = model.referenceDocument;
      return (
        <select {...common} disabled={busy} onChange={(event) => update(event.target.value)}>
          <option value="">Niciun contract ales</option>
          {contracts.map((document) => (
            <option key={document.documentId} value={document.documentId}>{[document.title, document.documentNumber].filter(Boolean).join(" · ")}</option>
          ))}
          {current && !contracts.some((document) => document.documentId === current) ? (
            <option value={current}>{known && known.documentId === current ? [known.title, known.documentNumber].filter(Boolean).join(" · ") : "Documentul ales"}</option>
          ) : null}
        </select>
      );
    }
    return (
      <input
        {...common}
        ref={first ? firstFieldRef : undefined}
        type={field.input === "email" || field.input === "tel" ? field.input : "text"}
        inputMode={field.input === "number" ? "decimal" : undefined}
        autoComplete="off"
        placeholder="necompletat"
        onChange={(event) => update(event.target.value)}
      />
    );
  }

  return (
    <div className="dcom-form">
      {FORM_GROUPS.map((group, groupIndex) => (
        <fieldset key={group.title} className="dcom-panel">
          <legend className="dcom-panel__title">{group.title}</legend>
          {group.rows.map((row, rowIndex) => (
            <div key={row.map((field) => field.key).join("-")} className="dcom-row" data-columns={row.length}>
              {row.map((field, index) => {
                const note = notes[field.key];
                const error = invalidField === field.key ? fieldError(field.key) : null;
                const text = error ?? note?.text ?? field.hint ?? null;
                const describedBy = text ? `${idPrefix}-${field.key}-note` : undefined;
                return (
                  <div key={field.key} className="dcom-field" data-wide={field.input === "notes" || field.input === "document" || undefined} data-state={error ? "invalid" : note?.tone === "check" ? "check" : undefined}>
                    <label htmlFor={`${idPrefix}-${field.key}`}>{model.labels[field.key] ?? field.key}</label>
                    {control(field, describedBy, groupIndex === 0 && rowIndex === 0 && index === 0)}
                    {text ? (
                      <p id={`${idPrefix}-${field.key}-note`} className="dcom-field__note" data-tone={error ? "error" : note?.tone}>
                        {text}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

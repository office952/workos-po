import type { ReactNode } from "react";
import type { CommercialTermsModel, DossierDocument } from "../../../adapters/customerDossierAdapter";
import type { CustomerTransport } from "../../../api/types";
import { DossierIcon, type DossierIconName } from "../dossier/dossierIcons";
import { clientRecordFacts, readLabel, readValue, type TermsVersion } from "./termsModel";

type Row = { key: string; label: string; lines: string[]; source?: string; link?: ReactNode };

const missing = <span className="dcom-missing">necompletat</span>;

/**
 * The read view (720:185): Identitate și facturare · Contacte · Condiții, a label column and the
 * value. CUI and the principal contact say they come from the client record. An empty value reads
 * "necompletat"; nothing is guessed (an account id is never turned into a person).
 */
export function CommercialRead({
  model,
  version,
  customer,
  reference,
  onPreview,
}: {
  model: CommercialTermsModel;
  version: TermsVersion;
  customer: CustomerTransport | null;
  reference: DossierDocument | null;
  onPreview: (document: DossierDocument) => void;
}) {
  const record = clientRecordFacts(customer);
  const value = (key: string) => readValue(key, version.fields[key]);
  const field = (key: string): Row => ({ key, label: readLabel(model, key), lines: [value(key)].filter((item): item is string => item !== null) });
  const person = (key: string, label: string, name: string | null, phone: string | null, email: string | null, source?: string): Row => ({
    key,
    label,
    lines: [name, phone, email].filter((item): item is string => item !== null),
    source,
  });
  const referenceRow = (): Row => {
    const known = model.referenceDocument && model.referenceDocument.documentId === version.fields.referenceDocumentId ? model.referenceDocument : null;
    const name = reference ? [reference.documentNumber, reference.title].filter(Boolean).join(" · ") : known ? [known.documentNumber, known.title].filter(Boolean).join(" · ") : null;
    if (!version.fields.referenceDocumentId) return { key: "referenceDocumentId", label: readLabel(model, "referenceDocumentId"), lines: [] };
    return {
      key: "referenceDocumentId",
      label: readLabel(model, "referenceDocumentId"),
      lines: [],
      link: (
        <>
          <span className="dcom-ref">{name ?? "Contract ales"}</span>
          {reference ? (
            <button type="button" className="dcom-ref__open" data-document-opener={reference.documentId} onClick={() => onPreview(reference)}>
              Previzualizează documentul →
            </button>
          ) : null}
        </>
      ),
    };
  };

  const groups: Array<{ title: string; icon: DossierIconName; rows: Row[] }> = [
    {
      title: "Identitate și facturare",
      icon: "document",
      rows: [
        field("legalName"),
        { key: "cui", label: "CUI", lines: record.cui ? [record.cui] : [], source: "din fișa clientului" },
        field("registrationNumber"),
        field("billingAddress"),
        field("bankAccount"),
        person("representative", readLabel(model, "representativeName"), value("representativeName"), value("representativeRole"), null),
      ],
    },
    {
      title: "Contacte",
      icon: "phone",
      rows: [
        person("principal", "Contact principal", record.contactName, record.phone, record.email, "din fișa clientului"),
        person("commercial", readLabel(model, "commercialContactName"), value("commercialContactName"), value("commercialContactPhone"), value("commercialContactEmail")),
        person("billing", readLabel(model, "billingContactName"), value("billingContactName"), value("billingContactPhone"), value("billingContactEmail")),
      ],
    },
    { title: "Condiții", icon: "file", rows: [field("paymentTermDays"), field("advancePercent"), field("currency"), referenceRow(), field("notes")] },
  ];

  return (
    <div className="dcom-groups">
      {groups.map((group) => (
        <section key={group.title} className="dcom-card" aria-label={group.title}>
          <p className="dcom-card__title">
            <DossierIcon name={group.icon} size={16} />
            {group.title}
          </p>
          <dl className="dcom-list">
            {group.rows.map((row) => (
              <div key={row.key} data-field={row.key}>
                <dt>{row.label}</dt>
                <dd>
                  {row.link ?? (row.lines.length ? (
                    <>
                      <span className="dcom-value">{row.lines[0]}</span>
                      {row.lines.slice(1).map((line) => <span key={line} className="dcom-sub">{line}</span>)}
                    </>
                  ) : (
                    missing
                  ))}
                  {row.source ? <span className="dcom-source">{row.source}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

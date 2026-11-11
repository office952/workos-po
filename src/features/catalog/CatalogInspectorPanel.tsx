import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { CatalogInspectorLayout } from "./catalogInspectorLayout";
import type { CatalogInspectorAction, CatalogInspectorModel } from "./catalogPropertyInspector";

type CatalogInspectorPanelProps = {
  model: CatalogInspectorModel;
  layout: CatalogInspectorLayout;
  closeLabel: string;
  onClose: () => void;
  onAction: (action: CatalogInspectorAction) => void;
  onRetryFormula?: () => void;
  children?: ReactNode;
};

export function CatalogInspectorPanel({
  model,
  layout,
  closeLabel,
  onClose,
  onAction,
  onRetryFormula,
  children,
}: CatalogInspectorPanelProps) {
  const headingId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (layout === "overlay" || layout === "full") {
      closeRef.current?.focus();
    }
  }, [layout, model.title]);

  useEffect(() => {
    if (layout !== "overlay") return;
    function trap(event: globalThis.KeyboardEvent) {
      const panel = rootRef.current;
      if (event.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [layout]);

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && layout !== "full") {
      event.stopPropagation();
      onClose();
    }
  }

  const region = (
    <section
      ref={rootRef}
      className="catv2-inspector"
      data-layout={layout}
      aria-labelledby={headingId}
      aria-live="polite"
      onKeyDown={onKeyDown}
    >
      <button ref={closeRef} type="button" className="catv2-link catv2-inspector__close" onClick={onClose}>
        {closeLabel}
      </button>
      <header className="catv2-inspector__head">
        <p className="catv2-inspector__eyebrow">{model.eyebrow}</p>
        <h3 id={headingId} className="catv2-inspector__title">{model.title}</h3>
        <p className="catv2-inspector__summary">{model.summary}</p>
      </header>
      {model.sections.map((section) => (
        <div key={section.id} className="catv2-inspector__block">
          <h4>{section.title}</h4>
          {section.lines.map((line, index) => (
            <p key={`${section.id}:${index}`}>
              {line.text}
              {line.action ? (
                <>
                  {" "}
                  <InspectorActionLink action={line.action} onAction={onAction} />
                </>
              ) : null}
            </p>
          ))}
          {section.warning ? (
            <div className="catv2-failure" role="alert">
              <p><strong>{section.warning.title}</strong> {section.warning.body}</p>
              {section.warning.retry && onRetryFormula ? (
                <button type="button" className="catv2-button catv2-button--secondary" onClick={onRetryFormula}>
                  Reîncearcă
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      <p className="catv2-inspector__note">{model.footnote}</p>
      {children}
    </section>
  );

  if (layout === "overlay") {
    return (
      <div className="catv2-inspector-layer">
        <button type="button" className="catv2-inspector-layer__backdrop" aria-label="Închide inspectorul" onClick={onClose} />
        <div className="catv2-inspector-layer__panel" role="dialog" aria-modal="true" aria-labelledby={headingId}>
          {region}
        </div>
      </div>
    );
  }
  return region;
}

function InspectorActionLink({
  action,
  onAction,
}: {
  action: CatalogInspectorAction;
  onAction: (action: CatalogInspectorAction) => void;
}) {
  if (action.kind === "admin") {
    return <a className="catv2-link" href={action.href}>{action.label}</a>;
  }
  return (
    <button type="button" className="catv2-link catv2-inspector__action" onClick={() => onAction(action)}>
      {action.label}
    </button>
  );
}

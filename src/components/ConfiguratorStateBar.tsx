import type { ReactNode } from "react";
import {
  CONFIGURATOR_WORK_STATES,
  configuratorWorkStateLabel,
  type ConfiguratorWorkState,
} from "../configuration/configuratorWorkState";

/** Where the values are kept now, plus the actions of the current work area. */
export function ConfiguratorStateBar({ state, assembly = false, saved = false, note, children }: {
  state: ConfiguratorWorkState;
  assembly?: boolean;
  /** A saved quote variant: three states (in work, confirmed, issued), nothing about the browser. */
  saved?: boolean;
  note?: string | null;
  children: ReactNode;
}) {
  const steps = saved ? CONFIGURATOR_WORK_STATES.filter((step) => step !== "SERVER_CHECK") : CONFIGURATOR_WORK_STATES;
  const shown: ConfiguratorWorkState = saved && state === "SERVER_CHECK" ? "LOCAL_DRAFT" : state;
  const currentIndex = steps.indexOf(shown);
  const current = configuratorWorkStateLabel(shown, assembly, saved);
  return (
    <div className="configuration-state-bar" data-testid="configuration-state-bar" data-state={state}>
      <div className="configuration-state-bar__status">
        <ol className="configuration-state-bar__steps" aria-label={saved ? "Starea variantei" : "Unde sunt păstrate valorile"}>
          {steps.map((step, index) => {
            const label = configuratorWorkStateLabel(step, assembly, saved);
            const position = index < currentIndex ? "done" : index === currentIndex ? "current" : "next";
            return (
              <li key={step} data-position={position} aria-current={position === "current" ? "step" : undefined}>
                <span className="configuration-state-bar__dot" aria-hidden="true" />
                <strong>{label.label}</strong>
                <span className="configuration-state-bar__note">{label.note}</span>
              </li>
            );
          })}
        </ol>
        <p className="u-visually-hidden" aria-live="polite">
          Stare: {current.label}, {current.note}.
        </p>
        {note ? <p className="configuration-state-bar__warning">{note}</p> : null}
      </div>
      <div className="configuration-state-bar__actions">{children}</div>
    </div>
  );
}

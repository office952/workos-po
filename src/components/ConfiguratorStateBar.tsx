import type { ReactNode } from "react";
import {
  CONFIGURATOR_WORK_STATES,
  configuratorWorkStateLabel,
  type ConfiguratorWorkState,
} from "../configuration/configuratorWorkState";

/** Where the values are kept now, plus the actions of the current work area. */
export function ConfiguratorStateBar({ state, assembly = false, note, children }: {
  state: ConfiguratorWorkState;
  assembly?: boolean;
  note?: string | null;
  children: ReactNode;
}) {
  const currentIndex = CONFIGURATOR_WORK_STATES.indexOf(state);
  const current = configuratorWorkStateLabel(state, assembly);
  return (
    <div className="configuration-state-bar" data-testid="configuration-state-bar" data-state={state}>
      <div className="configuration-state-bar__status">
        <ol className="configuration-state-bar__steps" aria-label="Unde sunt păstrate valorile">
          {CONFIGURATOR_WORK_STATES.map((step, index) => {
            const label = configuratorWorkStateLabel(step, assembly);
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

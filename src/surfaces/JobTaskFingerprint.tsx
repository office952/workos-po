import type { ExecutionTaskTransport } from "../api/types";

export function JobTaskFingerprint({
  tasks,
  selectedTaskId,
  onSelect,
}: {
  tasks: ExecutionTaskTransport[];
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
}) {
  const groups = new Map<string, ExecutionTaskTransport[]>();
  for (const task of tasks) {
    const label = task.scopeLabel.trim() || "Operații generale";
    groups.set(label, [...(groups.get(label) ?? []), task]);
  }
  const selected = tasks.find((task) => task.taskId === selectedTaskId);
  return (
    <section className="job-fingerprint" aria-label="Amprenta lucrării">
      <div className="job-fingerprint__heading">
        <h2>Amprenta lucrării</h2>
        <span>{tasks.length} operații</span>
      </div>
      <div className="job-fingerprint__groups">
        {[...groups].map(([label, operations]) => (
          <div className="job-fingerprint__group" key={label}>
            <span>{label}</span>
            <div
              className="job-fingerprint__segments"
              role="group"
              aria-label={label}
            >
              {operations.map((task) => (
                <button
                  type="button"
                  key={task.taskId}
                  className="job-fingerprint__segment"
                  data-state={
                    task.status === "COMPLETED"
                      ? "done"
                      : task.status === "IN_PROGRESS"
                        ? "live"
                        : task.waitingFor.length
                          ? "waiting"
                          : "planned"
                  }
                  aria-label={`${task.seqLabel} · ${task.processLabel} · ${task.statusLabel}`}
                  aria-pressed={task.taskId === selectedTaskId}
                  title={`${task.seqLabel} · ${task.processLabel} · ${task.statusLabel}`}
                  onClick={() => onSelect(task.taskId)}
                >
                  <span aria-hidden="true">
                    {task.status === "COMPLETED" ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
            <span className="job-fingerprint__fraction">
              {operations.filter((task) => task.status === "COMPLETED").length}/
              {operations.length}
            </span>
          </div>
        ))}
      </div>
      <p className="job-fingerprint__selected">
        <span>Selectată</span>
        <strong>
          {selected
            ? `${selected.seqLabel} · ${selected.processLabel}`
            : "Nicio operație"}
        </strong>
      </p>
      <div className="job-fingerprint__legend" aria-label="Legenda amprentei">
        <span>
          <i data-state="done" />
          Finalizată
        </span>
        <span>
          <i data-state="live" />
          În lucru
        </span>
        <span>
          <i data-state="waiting" />
          Așteaptă dependențe
        </span>
        <span>
          <i />
          Planificată / altă stare
        </span>
      </div>
    </section>
  );
}

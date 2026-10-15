import type { ExecutionTaskTransport } from "../api/types";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { TextField } from "../components/TextField";
import { formatTimestamp } from "../presentation/format";
import { presentQualityHistory, type QualityHistoryEntry } from "../presentation/qualityHistory";

type QualityControlPanelProps = {
  task: ExecutionTaskTransport;
  pending: boolean;
  note: string;
  correctionNote: string;
  onNote: (value: string) => void;
  onCorrectionNote: (value: string) => void;
  onPass: () => void;
  onFail: () => void;
  onCloseCorrection: () => void;
};

export function QualityControlPanel({
  task,
  pending,
  note,
  correctionNote,
  onNote,
  onCorrectionNote,
  onPass,
  onFail,
  onCloseCorrection,
}: QualityControlPanelProps) {
  if (!task.qualityControl) {
    return null;
  }
  const attempts = task.qualityAttempts ?? [];
  const history = presentQualityHistory(attempts, task.reworkEpisodes ?? []);
  const open = task.openReworkEpisode?.status === "OPEN" ? task.openReworkEpisode : null;
  const failNote =
    task.latestQualityResult === "FAIL"
      ? attempts.filter((attempt) => attempt.result === "FAIL").at(-1)?.note ?? null
      : null;
  return (
    <div className="stack" data-testid="quality-control">
      {open ? (
        <InlineAlert tone="error" title="Respins la control">
          {failNote ?? "Controlul a fost respins."} Corecția este necesară. Următoarele
          sarcini rămân blocate.
        </InlineAlert>
      ) : null}
      {task.canRecordQualityPass || task.canRecordQualityFail ? (
        <TextField
          id={`quality-note-${task.taskId}`}
          label="Notă de control"
          hint="Obligatorie la respingere. Opțională la acceptare."
          value={note}
          disabled={pending}
          onChange={onNote}
        />
      ) : null}
      <div className="cluster">
        {task.canRecordQualityPass ? (
          <Button disabled={pending} onClick={onPass}>
            Acceptă
          </Button>
        ) : null}
        {task.canRecordQualityFail ? (
          <Button disabled={pending || note.trim().length === 0} onClick={onFail}>
            Respinge
          </Button>
        ) : null}
      </div>
      {task.canCloseReworkEpisode ? (
        <>
          <TextField
            id={`correction-note-${task.taskId}`}
            label="Notă de corecție"
            value={correctionNote}
            disabled={pending}
            onChange={onCorrectionNote}
          />
          <div className="cluster">
            <Button disabled={pending || correctionNote.trim().length === 0} onClick={onCloseCorrection}>
              Închide corecția
            </Button>
          </div>
        </>
      ) : null}
      {history.length > 0 ? (
        <div className="stack" data-testid="quality-history">
          {history.map((entry) => (
            <QualityHistoryLine key={qualityHistoryKey(entry)} entry={entry} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function qualityHistoryKey(entry: QualityHistoryEntry): string {
  switch (entry.kind) {
    case "attempt":
      return `attempt-${entry.attempt.attemptSeq}`;
    case "correction":
      return `episode-${entry.episode.episodeSeq}`;
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

function QualityHistoryLine({ entry }: { entry: QualityHistoryEntry }) {
  switch (entry.kind) {
    case "attempt":
      return (
        <p>
          {entry.attempt.result === "PASS" ? "Acceptat" : "Respins"}
          {entry.attempt.note ? ` — ${entry.attempt.note}` : ""}
          {formatTimestamp(entry.attempt.recordedAt)
            ? ` — ${formatTimestamp(entry.attempt.recordedAt)}`
            : ""}
        </p>
      );
    case "correction":
      return (
        <p>
          Corecție închisă
          {entry.episode.correctionNote ? ` — ${entry.episode.correctionNote}` : ""}
          {entry.episode.closedAt && formatTimestamp(entry.episode.closedAt)
            ? ` — ${formatTimestamp(entry.episode.closedAt)}`
            : ""}
        </p>
      );
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}

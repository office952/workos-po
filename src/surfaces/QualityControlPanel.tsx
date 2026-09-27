import type { ExecutionTaskTransport } from "../api/types";
import { Button } from "../components/Button";
import { InlineAlert } from "../components/InlineAlert";
import { TextField } from "../components/TextField";
import { formatTimestamp } from "../presentation/format";

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
      {attempts.length > 0 ? (
        <div className="stack" data-testid="quality-history">
          {attempts.map((attempt) => (
            <p key={attempt.attemptSeq}>
              {attempt.result === "PASS" ? "Acceptat" : "Respins"}
              {attempt.note ? ` — ${attempt.note}` : ""}
              {formatTimestamp(attempt.recordedAt)
                ? ` — ${formatTimestamp(attempt.recordedAt)}`
                : ""}
            </p>
          ))}
          {(task.reworkEpisodes ?? [])
            .filter((episode) => episode.status === "CLOSED")
            .map((episode) => (
              <p key={`episode-${episode.episodeSeq}`}>
                Corecție închisă
                {episode.correctionNote ? ` — ${episode.correctionNote}` : ""}
                {episode.closedAt && formatTimestamp(episode.closedAt)
                  ? ` — ${formatTimestamp(episode.closedAt)}`
                  : ""}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}

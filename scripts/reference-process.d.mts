export const REFERENCE_PROCESS_MARKER: string;
export const REFERENCE_LAUNCH_PNPM_ARGS: string[];

type ReferencePidRecord = {
  pid?: unknown;
  classification?: unknown;
  port?: unknown;
  kind?: unknown;
};

export function recordedAllowsStop(
  recorded: ReferencePidRecord | null | undefined,
  commandLine: string | null | undefined,
): { ok: boolean; reason?: string };

export function isPositivelyIdentifiedReferenceProcess(
  pid: number,
  recorded: ReferencePidRecord | null | undefined,
  commandLine: string | null | undefined,
): boolean;

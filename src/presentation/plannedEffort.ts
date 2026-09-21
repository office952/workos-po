export const UNKNOWN_EFFORT_LABEL = "Fără estimare";

export function formatPlannedEffort(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return UNKNOWN_EFFORT_LABEL;
  }
  return formatKnownMinutes(minutes);
}

export function formatKnownMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  if (rest === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${rest}m`;
}

export function formatKnownQueuedEffort(
  knownQueuedMinutes: number,
  unknownEffortCount: number,
): string {
  const known = formatKnownMinutes(knownQueuedMinutes);
  if (unknownEffortCount > 0) {
    return `Timp cunoscut ${known}`;
  }
  return `Timp cunoscut ${known}`;
}

export function formatUnknownEffortCount(count: number): string {
  if (count === 1) {
    return "Fără estimare 1 sarcină";
  }
  return `Fără estimare ${count} sarcini`;
}

export function effortFieldsFromMinutes(minutes: number | null): {
  hours: string;
  minutes: string;
} {
  if (minutes === null) {
    return { hours: "", minutes: "" };
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return {
    hours: hours > 0 ? String(hours) : "",
    minutes: rest > 0 || hours === 0 ? String(rest) : "",
  };
}

export type EffortFieldParseResult =
  | { ok: true; plannedEffortMinutes: number | null }
  | { ok: false; error: "invalid_planned_effort" };

export function parseEffortFields(
  hoursText: string,
  minutesText: string,
): EffortFieldParseResult {
  const hoursRaw = hoursText.trim();
  const minutesRaw = minutesText.trim();
  if (hoursRaw === "" && minutesRaw === "") {
    return { ok: true, plannedEffortMinutes: null };
  }
  const hours = hoursRaw === "" ? 0 : parseWholeNumber(hoursRaw);
  const minutes = minutesRaw === "" ? 0 : parseWholeNumber(minutesRaw);
  if (hours === null || minutes === null || minutes > 59) {
    return { ok: false, error: "invalid_planned_effort" };
  }
  const total = hours * 60 + minutes;
  if (total < 1) {
    return { ok: false, error: "invalid_planned_effort" };
  }
  return { ok: true, plannedEffortMinutes: total };
}

function parseWholeNumber(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

export function plannedEffortErrorMessage(code: string | null): string {
  switch (code) {
    case "invalid_planned_effort":
      return "Timpul estimat trebuie să fie un număr întreg de minute, cel puțin 1, sau gol pentru fără estimare.";
    case "effort_frozen":
      return "Timpul estimat nu se mai poate schimba după ce sarcina a fost pornită.";
    case "forbidden":
      return "Doar ownerul poate modifica timpul estimat.";
    case "not_found":
      return "Sarcina nu a fost găsită.";
    default:
      return "Timpul estimat nu a putut fi salvat.";
  }
}

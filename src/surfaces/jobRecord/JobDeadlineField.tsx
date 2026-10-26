import { useEffect, useRef } from 'react';
import { Button } from '../../components/Button';
import { FieldFrame, fieldDescribedBy } from '../../components/FieldFrame';
import { CALENDAR_DATE, presentDeadlineDay } from './deadlineDay';

function pickerAvailable(): boolean {
  return typeof HTMLInputElement !== 'undefined' && typeof HTMLInputElement.prototype.showPicker === 'function';
}

const INCOMPLETE_DEADLINE_MESSAGE = 'Data din câmp este incompletă. Alege o zi din calendar sau apasă „Fără termen”.';

/**
 * N-022 · the job deadline as the browser's own date control. The value stays the stored
 * calendar day (`YYYY-MM-DD`) or empty for "no deadline"; choosing a day only changes the draft.
 * A partly typed or unreadable date is reported as `incomplete` instead of being taken for an
 * empty deadline, so the saved one is never dropped by accident.
 */
export function JobDeadlineField({ id, value, incomplete, savedLabel, disabled, onChange }: {
  id: string;
  value: string;
  incomplete: boolean;
  /** How the saved deadline reads elsewhere on the sheet, for a value the control cannot show. */
  savedLabel: string;
  disabled?: boolean;
  onChange: (value: string, incomplete: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // A discard or "Fără termen" also wipes the half-typed segments the control keeps on its own.
  useEffect(() => {
    const node = input.current;
    if (node && !incomplete && value === '' && node.validity?.badInput) node.value = '';
  }, [incomplete, value]);
  const day = presentDeadlineDay(value);
  const hint = incomplete ? undefined
    : day ? `Termen ales: ${day}.`
    : value ? `Termen salvat: ${savedLabel}. Calendarul nu îl poate afișa; alege o zi ca să-l schimbi.`
    : 'Lucrarea nu are termen. Alege o zi din calendar.';
  const error = incomplete ? INCOMPLETE_DEADLINE_MESSAGE : undefined;
  // Typing into some segments of an empty control, or emptying them all again, leaves its value
  // at "" and fires no change; the key or the departure from the field reports it instead.
  function recheck(node: HTMLInputElement) {
    if (node.value !== '') return;
    const unreadable = Boolean(node.validity?.badInput);
    if (unreadable !== incomplete) onChange('', unreadable);
  }
  function clearDeadline() {
    if (input.current) input.current.value = '';
    onChange('', false);
  }
  function openCalendar() {
    const node = input.current;
    if (!node) return;
    node.focus();
    try { node.showPicker(); } catch { /* The browser refused the picker; the focused control still opens with its own icon or keys. */ }
  }
  return (
    <FieldFrame id={id} label="Termen" hint={hint} error={error} className="job-deadline">
      <div className="job-deadline__row">
        <input
          ref={input}
          id={id}
          className="field__control job-deadline__control"
          type="date"
          // A browser that cannot show a date control falls back to text; the shape is then explicit.
          placeholder="AAAA-LL-ZZ"
          value={CALENDAR_DATE.test(value) ? value : ''}
          disabled={disabled}
          aria-invalid={incomplete}
          aria-describedby={fieldDescribedBy(id, hint, error)}
          onChange={(event) => {
            const next = event.target.value;
            const unreadable = (next === '' && Boolean(event.target.validity?.badInput)) || (next !== '' && !presentDeadlineDay(next));
            onChange(unreadable ? '' : next, unreadable);
          }}
          onKeyUp={(event) => recheck(event.currentTarget)}
          onBlur={(event) => recheck(event.currentTarget)}
        />
        {pickerAvailable() ? <Button variant="secondary" disabled={disabled} aria-controls={id} onClick={openCalendar}>Calendar</Button> : null}
        <Button variant="ghost" disabled={disabled || (value === '' && !incomplete)} onClick={clearDeadline}>Fără termen</Button>
      </div>
    </FieldFrame>
  );
}

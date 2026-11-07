const decimal = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const quantity = new Intl.NumberFormat("ro-RO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function formatQuantityValue(value: number): string {
  return quantity.format(value);
}

export function formatMoney(value: number, currency: string): string {
  return `${formatDecimal(value)} ${currency}`;
}

export function formatRate(value: number, currency: string, unit: string): string {
  return `${formatDecimal(value)} ${currency}/${unit}`;
}

export function formatQuantity(value: number, unit: string): string {
  return `${formatQuantityValue(value)} ${unit}`;
}

const shortDay = new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "2-digit" });

/** "05.11" for a commercial phase date; null when absent or unreadable. */
export function formatShortDay(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : shortDay.format(date);
}

export function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

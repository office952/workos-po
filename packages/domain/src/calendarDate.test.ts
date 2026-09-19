import { describe, expect, it } from "vitest";
import {
  VALID_UNTIL_INCLUSIVE,
  calendarDateCoversAsOf,
  calendarDateFromUtcInstant,
  calendarDateOrderIsValid,
  parseCanonicalCalendarDate,
} from "./calendarDate.js";

describe("canonical calendar dates", () => {
  it("accepts a real YYYY-MM-DD date", () => {
    expect(parseCanonicalCalendarDate("2026-02-28")).toEqual({
      ok: true,
      date: "2026-02-28",
    });
  });

  it("rejects impossible and malformed dates without normalizing them", () => {
    expect(parseCanonicalCalendarDate("2026-02-30")).toEqual({ ok: false });
    expect(parseCanonicalCalendarDate("2026-13-01")).toEqual({ ok: false });
    expect(parseCanonicalCalendarDate("abcd-01-01")).toEqual({ ok: false });
    expect(parseCanonicalCalendarDate("2026-02-28T00:00:00.000Z")).toEqual({
      ok: false,
    });
  });

  it("requires validFrom to be on or before validUntil", () => {
    expect(calendarDateOrderIsValid("2026-01-01", "2026-12-31")).toBe(true);
    expect(calendarDateOrderIsValid("2026-12-31", "2026-01-01")).toBe(false);
    expect(calendarDateOrderIsValid(null, "2026-01-01")).toBe(true);
  });

  it("compares validity on UTC calendar dates, inclusive through validUntil", () => {
    expect(VALID_UNTIL_INCLUSIVE).toBe(true);
    expect(calendarDateFromUtcInstant("2027-12-31T23:59:59Z")).toEqual({
      ok: true,
      date: "2027-12-31",
    });
    expect(
      calendarDateCoversAsOf({
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        asOf: "2027-01-01T23:59:59Z",
      }),
    ).toBe(true);
    expect(
      calendarDateCoversAsOf({
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        asOf: "2027-12-31T23:59:59Z",
      }),
    ).toBe(true);
    expect(
      calendarDateCoversAsOf({
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        asOf: "2028-01-01T00:00:00Z",
      }),
    ).toBe(false);
    expect(
      calendarDateCoversAsOf({
        validFrom: "2027-01-02",
        validUntil: "2027-12-31",
        asOf: "2027-01-01T23:59:59Z",
      }),
    ).toBe(false);
    expect(
      calendarDateCoversAsOf({
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        asOf: "not-a-date",
      }),
    ).toBe(false);
    expect(
      calendarDateCoversAsOf({
        validFrom: "2027-02-30",
        validUntil: "2027-12-31",
        asOf: "2027-03-01T00:00:00Z",
      }),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { RecurrenceFrequency, RecurrenceUnit } from "@prisma/client";
import { computeNextDueDate } from "@/features/todos/recurrence";

describe("computeNextDueDate", () => {
  const base = new Date("2026-08-10T00:00:00.000Z");

  it("advances daily from the scheduled due date", () => {
    expect(
      computeNextDueDate(base, { frequency: RecurrenceFrequency.DAILY }),
    ).toEqual(new Date("2026-08-11T00:00:00.000Z"));
  });

  it("advances weekly", () => {
    expect(
      computeNextDueDate(base, { frequency: RecurrenceFrequency.WEEKLY }),
    ).toEqual(new Date("2026-08-17T00:00:00.000Z"));
  });

  it("advances monthly", () => {
    expect(
      computeNextDueDate(base, { frequency: RecurrenceFrequency.MONTHLY }),
    ).toEqual(new Date("2026-09-10T00:00:00.000Z"));
  });

  it("supports custom every N days", () => {
    expect(
      computeNextDueDate(base, {
        frequency: RecurrenceFrequency.CUSTOM,
        interval: 3,
        unit: RecurrenceUnit.DAYS,
      }),
    ).toEqual(new Date("2026-08-13T00:00:00.000Z"));
  });

  it("supports custom every N weeks", () => {
    expect(
      computeNextDueDate(base, {
        frequency: RecurrenceFrequency.CUSTOM,
        interval: 2,
        unit: RecurrenceUnit.WEEKS,
      }),
    ).toEqual(new Date("2026-08-24T00:00:00.000Z"));
  });

  it("supports custom every N months", () => {
    expect(
      computeNextDueDate(base, {
        frequency: RecurrenceFrequency.CUSTOM,
        interval: 2,
        unit: RecurrenceUnit.MONTHS,
      }),
    ).toEqual(new Date("2026-10-10T00:00:00.000Z"));
  });
});

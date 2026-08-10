import {
  RecurrenceFrequency,
  RecurrenceUnit,
} from "@prisma/client";
import { addDays, addMonths, addWeeks } from "date-fns";

export type RecurrenceConfig = {
  frequency: RecurrenceFrequency;
  interval?: number | null;
  unit?: RecurrenceUnit | null;
};

/**
 * Compute the next due date for a recurring todo.
 * Cadence is preserved from the scheduled due date (not "now"),
 * so completing early/late does not drift the schedule.
 */
export function computeNextDueDate(
  currentDueDate: Date,
  config: RecurrenceConfig,
): Date {
  switch (config.frequency) {
    case RecurrenceFrequency.DAILY:
      return addDays(currentDueDate, 1);
    case RecurrenceFrequency.WEEKLY:
      return addWeeks(currentDueDate, 1);
    case RecurrenceFrequency.MONTHLY:
      return addMonths(currentDueDate, 1);
    case RecurrenceFrequency.CUSTOM: {
      const interval = config.interval ?? 1;
      const unit = config.unit ?? RecurrenceUnit.DAYS;

      switch (unit) {
        case RecurrenceUnit.DAYS:
          return addDays(currentDueDate, interval);
        case RecurrenceUnit.WEEKS:
          return addWeeks(currentDueDate, interval);
        case RecurrenceUnit.MONTHS:
          return addMonths(currentDueDate, interval);
        default: {
          const exhaustive: never = unit;
          throw new Error(`Unsupported recurrence unit: ${exhaustive}`);
        }
      }
    }
    default: {
      const exhaustive: never = config.frequency;
      throw new Error(`Unsupported recurrence frequency: ${exhaustive}`);
    }
  }
}

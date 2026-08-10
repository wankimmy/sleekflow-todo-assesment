import {
  RecurrenceFrequency,
  RecurrenceUnit,
  TodoPriority,
  TodoStatus,
} from "@prisma/client";
import { z } from "zod";

export const todoStatusSchema = z.nativeEnum(TodoStatus);
export const todoPrioritySchema = z.nativeEnum(TodoPriority);
export const recurrenceFrequencySchema = z.nativeEnum(RecurrenceFrequency);
export const recurrenceUnitSchema = z.nativeEnum(RecurrenceUnit);

const recurrenceFields = {
  isRecurring: z.boolean().default(false),
  recurrenceFrequency: recurrenceFrequencySchema.nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(365).nullable().optional(),
  recurrenceUnit: recurrenceUnitSchema.nullable().optional(),
};

function refineRecurrence<
  T extends {
    isRecurring: boolean;
    recurrenceFrequency?: RecurrenceFrequency | null;
    recurrenceInterval?: number | null;
    recurrenceUnit?: RecurrenceUnit | null;
  },
>(data: T, ctx: z.RefinementCtx) {
  if (!data.isRecurring) {
    return;
  }

  if (!data.recurrenceFrequency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceFrequency"],
      message: "Recurrence frequency is required when isRecurring is true",
    });
  }

  if (data.recurrenceFrequency === RecurrenceFrequency.CUSTOM) {
    if (!data.recurrenceInterval) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceInterval"],
        message: "Custom recurrence requires an interval (every N units)",
      });
    }
    if (!data.recurrenceUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceUnit"],
        message: "Custom recurrence requires a unit (DAYS, WEEKS, or MONTHS)",
      });
    }
  }
}

export const createTodoSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(5000).default(""),
    dueDate: z.coerce.date(),
    status: todoStatusSchema.default(TodoStatus.NOT_STARTED),
    priority: todoPrioritySchema.default(TodoPriority.MEDIUM),
    dependencyIds: z.array(z.string().cuid()).max(50).default([]),
    /** When true (default), todo is on the shared board. When false, requires auth. */
    sharedBoard: z.boolean().default(true),
    ...recurrenceFields,
  })
  .superRefine(refineRecurrence);

export const updateTodoSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    dueDate: z.coerce.date().optional(),
    status: todoStatusSchema.optional(),
    priority: todoPrioritySchema.optional(),
    dependencyIds: z.array(z.string().cuid()).max(50).optional(),
    version: z.number().int().positive(),
    isRecurring: z.boolean().optional(),
    recurrenceFrequency: recurrenceFrequencySchema.nullable().optional(),
    recurrenceInterval: z.number().int().min(1).max(365).nullable().optional(),
    recurrenceUnit: recurrenceUnitSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isRecurring === true) {
      refineRecurrence(
        {
          isRecurring: true,
          recurrenceFrequency: data.recurrenceFrequency,
          recurrenceInterval: data.recurrenceInterval,
          recurrenceUnit: data.recurrenceUnit,
        },
        ctx,
      );
    }
  });

export const listTodosQuerySchema = z.object({
  status: todoStatusSchema.optional(),
  priority: todoPrioritySchema.optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  dependencyStatus: z.enum(["blocked", "unblocked"]).optional(),
  search: z.string().trim().max(200).optional(),
  includeDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  onlyDeleted: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  sortBy: z
    .enum(["dueDate", "priority", "status", "name", "createdAt", "dependency"])
    .default("dueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /** Opaque keyset cursor; when set, page offset is ignored. */
  cursor: z.string().min(1).optional(),
});

export const bulkTodosSchema = z
  .object({
    action: z.enum(["complete", "softDelete", "restore", "setStatus"]),
    ids: z.array(z.string().cuid()).min(1).max(100),
    versionById: z.record(z.string(), z.number().int().positive()).optional(),
    status: todoStatusSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "setStatus" && !data.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "status is required for setStatus",
      });
    }
  });

export const calendarQuerySchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
export type ListTodosQuery = z.infer<typeof listTodosQuerySchema>;
export type BulkTodosInput = z.infer<typeof bulkTodosSchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export type ViewerContext = {
  userId: string | null;
};

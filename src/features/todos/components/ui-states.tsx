"use client";

import { format } from "date-fns";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  type TodoPriority,
  type TodoStatus,
  type TodoSummary,
} from "@/lib/api-client";

export function StatusBadge({ status }: { status: TodoStatus }) {
  const colors: Record<TodoStatus, string> = {
    NOT_STARTED: "bg-slate-100 text-slate-700",
    IN_PROGRESS: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-emerald-100 text-emerald-800",
    ARCHIVED: "bg-amber-100 text-amber-900",
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TodoPriority }) {
  const colors: Record<TodoPriority, string> = {
    LOW: "bg-slate-100 text-slate-700",
    MEDIUM: "bg-violet-100 text-violet-800",
    HIGH: "bg-rose-100 text-rose-800",
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function TodoMeta({ todo }: { todo: TodoSummary }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
      <span>Due {format(new Date(todo.dueDate), "MMM d, yyyy")}</span>
      {todo.isBlocked ? (
        <span className="font-medium text-rose-700">Blocked</span>
      ) : (
        <span className="font-medium text-emerald-700">Unblocked</span>
      )}
      {todo.isRecurring ? <span>Recurring</span> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-900"
    >
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md bg-rose-700 px-3 py-1.5 text-sm font-medium text-white"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
      {label}
    </div>
  );
}

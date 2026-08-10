"use client";

import { format } from "date-fns";
import { useMemo, useState } from "react";
import {
  STATUS_LABELS,
  type TodoStatus,
  type TodoSummary,
} from "@/lib/api-client";
import { PriorityBadge } from "./ui-states";

const KANBAN_COLUMNS: TodoStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "ARCHIVED",
];

type KanbanBoardProps = {
  todos: TodoSummary[];
  onlyDeleted?: boolean;
  onEdit: (todo: TodoSummary) => void;
  onDelete: (todo: TodoSummary) => void;
  onRestore: (todo: TodoSummary) => void;
  onMoveStatus: (todo: TodoSummary, status: TodoStatus) => void;
  isMoving?: boolean;
};

export function KanbanBoard({
  todos,
  onlyDeleted = false,
  onEdit,
  onDelete,
  onRestore,
  onMoveStatus,
  isMoving = false,
}: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TodoStatus | null>(null);

  const columns = useMemo(() => {
    const grouped: Record<TodoStatus, TodoSummary[]> = {
      NOT_STARTED: [],
      IN_PROGRESS: [],
      COMPLETED: [],
      ARCHIVED: [],
    };
    for (const todo of todos) {
      grouped[todo.status].push(todo);
    }
    return grouped;
  }, [todos]);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {KANBAN_COLUMNS.map((status) => {
        const items = columns[status];
        const isActiveDrop = dropTarget === status;

        return (
          <section
            key={status}
            className={`flex min-h-[24rem] flex-col rounded-xl border bg-slate-50 ${
              isActiveDrop
                ? "border-indigo-400 ring-2 ring-indigo-200"
                : "border-slate-200"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDropTarget(status);
            }}
            onDragLeave={() => {
              setDropTarget((current) => (current === status ? null : current));
            }}
            onDrop={(event) => {
              event.preventDefault();
              const todoId = event.dataTransfer.getData("text/todo-id");
              const todo = todos.find((item) => item.id === todoId);
              setDropTarget(null);
              setDraggingId(null);
              if (!todo || todo.status === status || onlyDeleted) {
                return;
              }
              onMoveStatus(todo, status);
            }}
          >
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3">
              <h3 className="text-sm font-semibold text-slate-800">
                {STATUS_LABELS[status]}
              </h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                {items.length}
              </span>
            </header>

            <div className="flex flex-1 flex-col gap-3 p-3">
              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">
                  Drop cards here
                </p>
              ) : null}

              {items.map((todo) => (
                <article
                  key={todo.id}
                  draggable={!onlyDeleted && !isMoving}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/todo-id", todo.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingId(todo.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${
                    draggingId === todo.id ? "opacity-60" : ""
                  } ${onlyDeleted ? "" : "cursor-grab active:cursor-grabbing"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-900">
                      {todo.name}
                    </h4>
                    <PriorityBadge priority={todo.priority} />
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs text-slate-600">
                    {todo.description || "No description"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span>Due {format(new Date(todo.dueDate), "MMM d")}</span>
                    {todo.isBlocked ? (
                      <span className="font-medium text-rose-700">Blocked</span>
                    ) : (
                      <span className="font-medium text-emerald-700">
                        Unblocked
                      </span>
                    )}
                    {todo.isRecurring ? <span>Recurring</span> : null}
                  </div>
                  {todo.dependencies.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Depends on:{" "}
                      {todo.dependencies.map((dep) => dep.name).join(", ")}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {onlyDeleted ? (
                      <button
                        type="button"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
                        onClick={() => onRestore(todo)}
                      >
                        Restore
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
                          onClick={() => onEdit(todo)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700"
                          onClick={() => onDelete(todo)}
                        >
                          Delete
                        </button>
                        <label className="sr-only" htmlFor={`move-${todo.id}`}>
                          Move to status
                        </label>
                        <select
                          id={`move-${todo.id}`}
                          value={todo.status}
                          disabled={isMoving}
                          onChange={(event) =>
                            onMoveStatus(
                              todo,
                              event.target.value as TodoStatus,
                            )
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          {KANBAN_COLUMNS.map((columnStatus) => (
                            <option key={columnStatus} value={columnStatus}>
                              {STATUS_LABELS[columnStatus]}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import {
  ApiClientError,
  PRIORITY_LABELS,
  STATUS_LABELS,
  apiGet,
  apiSend,
  type TodoListResponse,
  type TodoPriority,
  type TodoStatus,
  type TodoSummary,
} from "@/lib/api-client";

type TodoFormProps = {
  initial?: TodoSummary | null;
  onClose: () => void;
};

type FormState = {
  name: string;
  description: string;
  dueDate: string;
  status: TodoStatus;
  priority: TodoPriority;
  isRecurring: boolean;
  recurrenceFrequency: string;
  recurrenceInterval: number;
  recurrenceUnit: string;
  dependencyIds: string[];
  sharedBoard: boolean;
};

function buildInitialForm(initial?: TodoSummary | null): FormState {
  if (!initial) {
    return {
      name: "",
      description: "",
      dueDate: new Date().toISOString().slice(0, 10),
      status: "NOT_STARTED",
      priority: "MEDIUM",
      isRecurring: false,
      recurrenceFrequency: "WEEKLY",
      recurrenceInterval: 1,
      recurrenceUnit: "WEEKS",
      dependencyIds: [],
      sharedBoard: true,
    };
  }

  return {
    name: initial.name,
    description: initial.description,
    dueDate: initial.dueDate.slice(0, 10),
    status: initial.status,
    priority: initial.priority,
    isRecurring: initial.isRecurring,
    recurrenceFrequency: initial.recurrenceFrequency ?? "WEEKLY",
    recurrenceInterval: initial.recurrenceInterval ?? 1,
    recurrenceUnit: initial.recurrenceUnit ?? "WEEKS",
    dependencyIds: initial.dependencies.map((dep) => dep.id),
    sharedBoard: initial.ownerId === null,
  };
}

export function TodoForm({ initial, onClose }: TodoFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => buildInitialForm(initial));
  const [error, setError] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["todos", "dependency-options"],
    queryFn: () =>
      apiGet<TodoListResponse>("/api/todos?pageSize=100&sortBy=name&sortOrder=asc"),
  });

  const dependencyOptions = useMemo(
    () =>
      (optionsQuery.data?.items ?? []).filter(
        (todo) => todo.id !== initial?.id,
      ),
    [optionsQuery.data?.items, initial?.id],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        description: form.description,
        dueDate: form.dueDate,
        status: form.status,
        priority: form.priority,
        dependencyIds: form.dependencyIds,
        isRecurring: form.isRecurring,
        recurrenceFrequency: form.isRecurring
          ? form.recurrenceFrequency
          : null,
        recurrenceInterval: form.isRecurring
          ? form.recurrenceFrequency === "CUSTOM"
            ? form.recurrenceInterval
            : 1
          : null,
        recurrenceUnit: form.isRecurring
          ? form.recurrenceFrequency === "CUSTOM"
            ? form.recurrenceUnit
            : form.recurrenceFrequency === "DAILY"
              ? "DAYS"
              : form.recurrenceFrequency === "WEEKLY"
                ? "WEEKS"
                : "MONTHS"
          : null,
        ...(initial
          ? { version: initial.version }
          : { sharedBoard: form.sharedBoard }),
      };

      if (initial) {
        return apiSend<TodoSummary>(`/api/todos/${initial.id}`, "PATCH", payload);
      }

      return apiSend<TodoSummary>("/api/todos", "POST", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      onClose();
    },
    onError: (err: unknown) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError("Unable to save todo");
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="todo-form-title"
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="todo-form-title" className="text-lg font-semibold">
            {initial ? "Edit TODO" : "Create TODO"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {!initial ? (
            <fieldset className="rounded-md border border-slate-200 p-3 text-sm">
              <legend className="px-1 font-medium">Ownership</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ownership"
                  checked={form.sharedBoard}
                  onChange={() =>
                    setForm((current) => ({ ...current, sharedBoard: true }))
                  }
                />
                Shared board (visible to everyone)
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="radio"
                  name="ownership"
                  checked={!form.sharedBoard}
                  onChange={() =>
                    setForm((current) => ({ ...current, sharedBoard: false }))
                  }
                />
                Mine (requires sign-in)
              </label>
            </fieldset>
          ) : null}

          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium">Description</span>
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Due date</span>
              <input
                required
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as TodoStatus,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium">Priority</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value as TodoPriority,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm sm:mt-7">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isRecurring: event.target.checked,
                  }))
                }
              />
              <span className="font-medium">Recurring task</span>
            </label>
          </div>

          {form.isRecurring ? (
            <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-1">
                <span className="font-medium">Frequency</span>
                <select
                  value={form.recurrenceFrequency}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      recurrenceFrequency: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </label>

              {form.recurrenceFrequency === "CUSTOM" ? (
                <>
                  <label className="block text-sm">
                    <span className="font-medium">Every</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={form.recurrenceInterval}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recurrenceInterval: Number(event.target.value),
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="font-medium">Unit</span>
                    <select
                      value={form.recurrenceUnit}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recurrenceUnit: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                    >
                      <option value="DAYS">Days</option>
                      <option value="WEEKS">Weeks</option>
                      <option value="MONTHS">Months</option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          ) : null}

          <fieldset>
            <legend className="text-sm font-medium">Depends on</legend>
            <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
              {dependencyOptions.length === 0 ? (
                <p className="text-sm text-slate-500">No other todos available.</p>
              ) : (
                dependencyOptions.map((todo) => {
                  const checked = form.dependencyIds.includes(todo.id);
                  return (
                    <label key={todo.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            dependencyIds: event.target.checked
                              ? [...current.dependencyIds, todo.id]
                              : current.dependencyIds.filter((id) => id !== todo.id),
                          }));
                        }}
                      />
                      <span>
                        {todo.name}
                        <span className="block text-xs text-slate-500">
                          {STATUS_LABELS[todo.status]}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </fieldset>

          {error ? (
            <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

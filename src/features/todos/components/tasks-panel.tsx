"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ApiClientError,
  PRIORITY_LABELS,
  STATUS_LABELS,
  apiGet,
  apiSend,
  type TodoListResponse,
  type TodoStatus,
  type TodoSummary,
} from "@/lib/api-client";
import { TodoForm } from "./todo-form";
import { KanbanBoard } from "./kanban-board";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PriorityBadge,
  StatusBadge,
  TodoMeta,
} from "./ui-states";

type SortableColumn = "name" | "status" | "priority" | "dueDate" | "dependency";
type ViewMode = "table" | "kanban";

function buildQuery(searchParams: URLSearchParams, view: ViewMode) {
  const params = new URLSearchParams(searchParams);
  if (!params.get("page")) params.set("page", "1");
  if (!params.get("sortBy")) params.set("sortBy", "dueDate");
  if (!params.get("sortOrder")) params.set("sortOrder", "asc");

  if (view === "kanban") {
    // Kanban columns already represent status; load a wide page for the board.
    params.delete("status");
    params.set("page", "1");
    params.set("pageSize", "100");
  } else if (!params.get("pageSize")) {
    params.set("pageSize", "25");
  }

  params.delete("view");
  return params.toString();
}

function SortHeader({
  label,
  column,
  activeSortBy,
  activeSortOrder,
  onSort,
}: {
  label: string;
  column: SortableColumn;
  activeSortBy: string;
  activeSortOrder: string;
  onSort: (column: SortableColumn) => void;
}) {
  const active = activeSortBy === column;
  const indicator = !active ? "↕" : activeSortOrder === "asc" ? "↑" : "↓";

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide ${
        active ? "text-indigo-700" : "text-slate-600 hover:text-slate-900"
      }`}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{indicator}</span>
    </button>
  );
}

export function TasksPanel({ onlyDeleted = false }: { onlyDeleted?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TodoSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState(
    () => searchParams.get("search") ?? "",
  );
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const view: ViewMode =
    searchParams.get("view") === "kanban" ? "kanban" : "table";

  const queryString = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (onlyDeleted) {
      params.set("onlyDeleted", "true");
    }
    return buildQuery(params, view);
  }, [searchParams, onlyDeleted, view]);

  const todosQuery = useQuery({
    queryKey: ["todos", queryString, view],
    queryFn: () => apiGet<TodoListResponse>(`/api/todos?${queryString}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (todo: TodoSummary) =>
      apiSend<TodoSummary>(`/api/todos/${todo.id}`, "DELETE"),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error: unknown) => {
      setActionError(
        error instanceof ApiClientError ? error.message : "Delete failed",
      );
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (todo: TodoSummary) =>
      apiSend<TodoSummary>(`/api/todos/${todo.id}/restore`, "POST"),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: unknown) => {
      setActionError(
        error instanceof ApiClientError ? error.message : "Restore failed",
      );
    },
  });

  const moveStatusMutation = useMutation({
    mutationFn: ({
      todo,
      status,
    }: {
      todo: TodoSummary;
      status: TodoStatus;
    }) =>
      apiSend<TodoSummary>(`/api/todos/${todo.id}`, "PATCH", {
        status,
        version: todo.version,
      }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error: unknown) => {
      setActionError(
        error instanceof ApiClientError
          ? error.message
          : "Unable to move todo",
      );
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (action: "softDelete" | "restore" | "complete") => {
      const items = todosQuery.data?.items ?? [];
      const selected = items.filter((todo) => selectedIds.includes(todo.id));
      const versionById = Object.fromEntries(
        selected.map((todo) => [todo.id, todo.version]),
      );
      return apiSend<{
        results: TodoSummary[];
        errors: Array<{ id: string; code: string; message: string }>;
      }>("/api/todos/bulk", "POST", {
        action,
        ids: selectedIds,
        ...(action === "complete" ? { versionById } : {}),
      });
    },
    onSuccess: async (result) => {
      setSelectedIds([]);
      if (result.errors.length > 0) {
        setActionError(
          `${result.errors.length} bulk item(s) failed: ${result.errors[0]?.message}`,
        );
      } else {
        setActionError(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["todos"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error: unknown) => {
      setActionError(
        error instanceof ApiClientError ? error.message : "Bulk action failed",
      );
    },
  });

  function updateParams(updates: Record<string, string>, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    if (resetPage && !("page" in updates)) {
      params.set("page", "1");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function updateParam(key: string, value: string) {
    updateParams({ [key]: value });
  }

  function onSearchChange(value: string) {
    setSearchDraft(value);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      updateParam("search", value.trim());
    }, 300);
  }

  function onSort(column: SortableColumn) {
    const currentSortBy = searchParams.get("sortBy") ?? "dueDate";
    const currentOrder = searchParams.get("sortOrder") ?? "asc";
    if (currentSortBy === column) {
      updateParams({
        sortBy: column,
        sortOrder: currentOrder === "asc" ? "desc" : "asc",
      });
      return;
    }
    updateParams({ sortBy: column, sortOrder: "asc" });
  }

  function clearFilters() {
    setSearchDraft("");
    const params = new URLSearchParams();
    if (view === "kanban") {
      params.set("view", "kanban");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function setView(nextView: ViewMode) {
    if (nextView === "kanban") {
      updateParams({ view: "kanban", status: "", page: "1" });
      return;
    }
    updateParams({ view: "", page: "1" });
  }

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const page = Number(searchParams.get("page") ?? "1");
  const totalPages = todosQuery.data?.totalPages ?? 1;
  const sortBy = searchParams.get("sortBy") ?? "dueDate";
  const sortOrder = searchParams.get("sortOrder") ?? "asc";
  const hasActiveFilters = Boolean(
    searchParams.get("search") ||
      (view === "table" && searchParams.get("status")) ||
      searchParams.get("priority") ||
      searchParams.get("dueAfter") ||
      searchParams.get("dueBefore") ||
      searchParams.get("dependencyStatus"),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {onlyDeleted ? "Trash" : "Tasks"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Switch between table and kanban. Table supports column sort/filter;
            kanban lets you drag cards between statuses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!onlyDeleted ? (
            <div
              className="inline-flex rounded-md border border-slate-300 bg-white p-1"
              role="group"
              aria-label="Tasks view mode"
            >
              <button
                type="button"
                onClick={() => setView("table")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  view === "table"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                aria-pressed={view === "table"}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setView("kanban")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  view === "kanban"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                aria-pressed={view === "kanban"}
              >
                Kanban
              </button>
            </div>
          ) : null}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
            >
              Clear filters
            </button>
          ) : null}
          {!onlyDeleted ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            >
              New TODO
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {actionError}
        </p>
      ) : null}

      {todosQuery.isLoading ? <LoadingState label="Loading todos…" /> : null}
      {todosQuery.isError ? (
        <ErrorState
          message={
            todosQuery.error instanceof Error
              ? todosQuery.error.message
              : "Failed to load todos"
          }
          onRetry={() => todosQuery.refetch()}
        />
      ) : null}

      {view === "kanban" ? (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="font-medium">Search</span>
              <input
                value={searchDraft}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Name, description, deps…"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Priority</span>
              <select
                value={searchParams.get("priority") ?? ""}
                onChange={(event) =>
                  updateParam("priority", event.target.value)
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">All</option>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="font-medium">Due after</span>
              <input
                type="date"
                value={searchParams.get("dueAfter") ?? ""}
                onChange={(event) =>
                  updateParam("dueAfter", event.target.value)
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="font-medium">Dependency</span>
              <select
                value={searchParams.get("dependencyStatus") ?? ""}
                onChange={(event) =>
                  updateParam("dependencyStatus", event.target.value)
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="">All</option>
                <option value="blocked">Blocked</option>
                <option value="unblocked">Unblocked</option>
              </select>
            </label>
          </div>

          {todosQuery.data ? (
            <>
              <KanbanBoard
                todos={todosQuery.data.items}
                onlyDeleted={onlyDeleted}
                isMoving={moveStatusMutation.isPending}
                onEdit={setEditing}
                onDelete={(todo) => deleteMutation.mutate(todo)}
                onRestore={(todo) => restoreMutation.mutate(todo)}
                onMoveStatus={(todo, status) =>
                  moveStatusMutation.mutate({ todo, status })
                }
              />
              {todosQuery.data.total > todosQuery.data.items.length ? (
                <p className="text-sm text-slate-600">
                  Showing {todosQuery.data.items.length} of{" "}
                  {todosQuery.data.total} matching todos on the board.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-indigo-50 px-4 py-2 text-sm">
            <span className="font-medium">{selectedIds.length} selected</span>
            {onlyDeleted ? (
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1"
                onClick={() => bulkMutation.mutate("restore")}
                disabled={bulkMutation.isPending}
              >
                Bulk restore
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1"
                  onClick={() => bulkMutation.mutate("complete")}
                  disabled={bulkMutation.isPending}
                >
                  Bulk complete
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1"
                  onClick={() => bulkMutation.mutate("softDelete")}
                  disabled={bulkMutation.isPending}
                >
                  Bulk delete
                </button>
              </>
            )}
            <button
              type="button"
              className="rounded-md px-2 py-1 text-slate-600 underline"
              onClick={() => setSelectedIds([])}
            >
              Clear
            </button>
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={
                      (todosQuery.data?.items.length ?? 0) > 0 &&
                      selectedIds.length === (todosQuery.data?.items.length ?? 0)
                    }
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(
                          (todosQuery.data?.items ?? []).map((todo) => todo.id),
                        );
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortHeader
                    label="Name"
                    column="name"
                    activeSortBy={sortBy}
                    activeSortOrder={sortOrder}
                    onSort={onSort}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortHeader
                    label="Status"
                    column="status"
                    activeSortBy={sortBy}
                    activeSortOrder={sortOrder}
                    onSort={onSort}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortHeader
                    label="Priority"
                    column="priority"
                    activeSortBy={sortBy}
                    activeSortOrder={sortOrder}
                    onSort={onSort}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortHeader
                    label="Due"
                    column="dueDate"
                    activeSortBy={sortBy}
                    activeSortOrder={sortOrder}
                    onSort={onSort}
                  />
                </th>
                <th className="px-4 py-3">
                  <SortHeader
                    label="Deps"
                    column="dependency"
                    activeSortBy={sortBy}
                    activeSortOrder={sortOrder}
                    onSort={onSort}
                  />
                </th>
                <th className="px-4 py-3 text-slate-500">Actions</th>
              </tr>
              <tr className="border-t border-slate-200 bg-white">
                <th className="px-3 py-2" />
                <th className="px-4 py-2 font-normal">
                  <label className="sr-only" htmlFor="filter-search">
                    Search name, description, or dependencies
                  </label>
                  <input
                    id="filter-search"
                    value={searchDraft}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search all text…"
                    className="w-full min-w-[10rem] rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal normal-case tracking-normal"
                  />
                </th>
                <th className="px-4 py-2 font-normal">
                  <label className="sr-only" htmlFor="filter-status">
                    Filter status
                  </label>
                  <select
                    id="filter-status"
                    value={searchParams.get("status") ?? ""}
                    onChange={(event) =>
                      updateParam("status", event.target.value)
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal normal-case tracking-normal"
                  >
                    <option value="">All</option>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-4 py-2 font-normal">
                  <label className="sr-only" htmlFor="filter-priority">
                    Filter priority
                  </label>
                  <select
                    id="filter-priority"
                    value={searchParams.get("priority") ?? ""}
                    onChange={(event) =>
                      updateParam("priority", event.target.value)
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal normal-case tracking-normal"
                  >
                    <option value="">All</option>
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-4 py-2 font-normal">
                  <div className="flex min-w-[11rem] flex-col gap-1">
                    <label className="sr-only" htmlFor="filter-due-after">
                      Due after
                    </label>
                    <input
                      id="filter-due-after"
                      type="date"
                      value={searchParams.get("dueAfter") ?? ""}
                      onChange={(event) =>
                        updateParam("dueAfter", event.target.value)
                      }
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal normal-case tracking-normal"
                    />
                    <label className="sr-only" htmlFor="filter-due-before">
                      Due before
                    </label>
                    <input
                      id="filter-due-before"
                      type="date"
                      value={searchParams.get("dueBefore") ?? ""}
                      onChange={(event) =>
                        updateParam("dueBefore", event.target.value)
                      }
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal normal-case tracking-normal"
                    />
                  </div>
                </th>
                <th className="px-4 py-2 font-normal">
                  <label className="sr-only" htmlFor="filter-deps">
                    Filter dependencies
                  </label>
                  <select
                    id="filter-deps"
                    value={searchParams.get("dependencyStatus") ?? ""}
                    onChange={(event) =>
                      updateParam("dependencyStatus", event.target.value)
                    }
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal normal-case tracking-normal"
                  >
                    <option value="">All</option>
                    <option value="blocked">Blocked</option>
                    <option value="unblocked">Unblocked</option>
                  </select>
                </th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {todosQuery.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8">
                    <EmptyState
                      title={onlyDeleted ? "Trash is empty" : "No todos match"}
                      body={
                        onlyDeleted
                          ? "Deleted todos will appear here until restored."
                          : "Try clearing filters or create a new TODO."
                      }
                    />
                  </td>
                </tr>
              ) : null}

              {todosQuery.data?.items.map((todo) => (
                <tr
                  key={todo.id}
                  id={`todo-${todo.id}`}
                  className={`align-top ${
                    searchParams.get("focus") === todo.id
                      ? "bg-indigo-50"
                      : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${todo.name}`}
                      checked={selectedIds.includes(todo.id)}
                      onChange={(event) => {
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...current, todo.id]
                            : current.filter((id) => id !== todo.id),
                        );
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {todo.name}
                      {todo.ownerId ? (
                        <span className="ml-2 text-xs font-normal text-indigo-600">
                          mine
                        </span>
                      ) : (
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          shared
                        </span>
                      )}
                    </div>
                    <div className="mt-1 line-clamp-2 text-slate-600">
                      {todo.description || "No description"}
                    </div>
                    <TodoMeta todo={todo} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={todo.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={todo.priority} />
                  </td>
                  <td className="px-4 py-3">
                    {format(new Date(todo.dueDate), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          todo.isBlocked
                            ? "bg-rose-100 text-rose-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {todo.isBlocked ? "Blocked" : "Unblocked"}
                      </span>
                      <div className="text-slate-600">
                        {todo.dependencies.length === 0
                          ? "—"
                          : todo.dependencies.map((dep) => dep.name).join(", ")}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      {onlyDeleted ? (
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
                          onClick={() => restoreMutation.mutate(todo)}
                        >
                          Restore
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium"
                            onClick={() => setEditing(todo)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700"
                            onClick={() => deleteMutation.mutate(todo)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {todosQuery.data ? (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">
              Page {page} of {totalPages} · {todosQuery.data.total} total
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() =>
                  updateParams({ page: String(page - 1) }, false)
                }
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() =>
                  updateParams({ page: String(page + 1) }, false)
                }
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
      )}

      {creating ? <TodoForm onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <TodoForm initial={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

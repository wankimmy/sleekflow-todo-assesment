"use client";

import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiGet, type TodoSummary } from "@/lib/api-client";
import { ErrorState, LoadingState, PriorityBadge, StatusBadge } from "./ui-states";

type Range = { start: string; end: string };

const STATUS_EVENT_COLORS: Record<string, string> = {
  NOT_STARTED: "#64748b",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#059669",
  ARCHIVED: "#d97706",
};

export function CalendarPanel() {
  const [range, setRange] = useState<Range | null>(null);
  const [selected, setSelected] = useState<TodoSummary | null>(null);

  const calendarQuery = useQuery({
    queryKey: ["calendar", range?.start, range?.end],
    enabled: Boolean(range),
    queryFn: () =>
      apiGet<TodoSummary[]>(
        `/api/calendar?start=${encodeURIComponent(range!.start)}&end=${encodeURIComponent(range!.end)}`,
      ),
  });

  const events = useMemo(
    () =>
      (calendarQuery.data ?? []).map((todo) => ({
        id: todo.id,
        title: `${todo.name} [${todo.priority}]`,
        start: todo.dueDate,
        allDay: true,
        backgroundColor: STATUS_EVENT_COLORS[todo.status],
        borderColor: STATUS_EVENT_COLORS[todo.status],
        extendedProps: { todo },
      })),
    [calendarQuery.data],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Calendar</h2>
        <p className="mt-1 text-sm text-slate-600">
          Loads only todos in the visible date range. Event color reflects status;
          title includes priority text.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          height="auto"
          events={events}
          datesSet={(arg) => {
            setRange({
              start: arg.start.toISOString(),
              end: arg.end.toISOString(),
            });
          }}
          eventClick={(info) => {
            setSelected(info.event.extendedProps.todo as TodoSummary);
          }}
        />
      </div>

      {calendarQuery.isLoading ? <LoadingState label="Loading calendar todos…" /> : null}
      {calendarQuery.isError ? (
        <ErrorState
          message={
            calendarQuery.error instanceof Error
              ? calendarQuery.error.message
              : "Failed to load calendar"
          }
          onRetry={() => calendarQuery.refetch()}
        />
      ) : null}

      {selected ? (
        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{selected.name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {selected.description || "No description"}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={selected.status} />
            <PriorityBadge priority={selected.priority} />
            {selected.isBlocked ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                Blocked
              </span>
            ) : null}
            {selected.isRecurring ? (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                Recurring
              </span>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  apiGet,
  type DashboardResponse,
} from "@/lib/api-client";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PriorityBadge,
  StatusBadge,
} from "./ui-states";

const STATUS_COLORS = {
  NOT_STARTED: "#64748b",
  IN_PROGRESS: "#2563eb",
  COMPLETED: "#059669",
  ARCHIVED: "#d97706",
};

const PRIORITY_COLORS = {
  LOW: "#64748b",
  MEDIUM: "#7c3aed",
  HIGH: "#e11d48",
};

export function DashboardPanel() {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardResponse>("/api/dashboard"),
  });

  if (dashboardQuery.isLoading) {
    return <LoadingState label="Loading dashboard…" />;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <ErrorState
        message={
          dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : "Failed to load dashboard"
        }
        onRetry={() => dashboardQuery.refetch()}
      />
    );
  }

  const data = dashboardQuery.data;

  const statusData = Object.entries(data.byStatus).map(([status, value]) => ({
    name: STATUS_LABELS[status as keyof typeof STATUS_LABELS],
    key: status,
    value,
  }));

  const priorityData = Object.entries(data.byPriority).map(
    ([priority, value]) => ({
      name: PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS],
      key: priority,
      value,
    }),
  );

  const dependencyData = [
    { name: "Blocked", value: data.dependencyHealth.blocked, key: "blocked" },
    {
      name: "Unblocked",
      value: data.dependencyHealth.unblocked,
      key: "unblocked",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">
          Overview of workload, priorities, and dependency health.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Active todos</p>
          <p className="mt-2 text-3xl font-semibold">{data.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">In progress</p>
          <p className="mt-2 text-3xl font-semibold">
            {data.byStatus.IN_PROGRESS}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Blocked</p>
          <p className="mt-2 text-3xl font-semibold text-rose-700">
            {data.dependencyHealth.blocked}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Unblocked</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-700">
            {data.dependencyHealth.unblocked}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-1">
          <h3 className="font-semibold">Status distribution</h3>
          <p className="mt-1 text-xs text-slate-500">
            Counts by status with labels (not color-only).
          </p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label
                >
                  {statusData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={
                        STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-1">
          <h3 className="font-semibold">Priority mix</h3>
          <p className="mt-1 text-xs text-slate-500">High / Medium / Low counts.</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Todos">
                  {priorityData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={
                        PRIORITY_COLORS[
                          entry.key as keyof typeof PRIORITY_COLORS
                        ]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 xl:col-span-1">
          <h3 className="font-semibold">Dependency health</h3>
          <p className="mt-1 text-xs text-slate-500">
            Blocked vs unblocked active todos.
          </p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dependencyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="Todos">
                  <Cell fill="#e11d48" />
                  <Cell fill="#059669" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Upcoming work</h3>
        <p className="mt-1 text-sm text-slate-600">
          Next Not Started / In Progress items by due date.
        </p>

        {data.upcoming.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No upcoming work"
              body="Create a TODO or move archived/completed items out of the active queue."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Blocked?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.upcoming.map((todo) => (
                  <tr key={todo.id}>
                    <td className="px-3 py-2 font-medium">{todo.name}</td>
                    <td className="px-3 py-2">
                      {format(new Date(todo.dueDate), "MMM d, yyyy")}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={todo.status} />
                    </td>
                    <td className="px-3 py-2">
                      <PriorityBadge priority={todo.priority} />
                    </td>
                    <td className="px-3 py-2">
                      {todo.isBlocked ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

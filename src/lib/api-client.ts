export type TodoStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";
export type TodoPriority = "LOW" | "MEDIUM" | "HIGH";

export type TodoSummary = {
  id: string;
  name: string;
  description: string;
  dueDate: string;
  status: TodoStatus;
  priority: TodoPriority;
  isRecurring: boolean;
  recurrenceFrequency: string | null;
  recurrenceInterval: number | null;
  recurrenceUnit: string | null;
  version: number;
  completedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  previousOccurrenceId: string | null;
  ownerId: string | null;
  isBlocked: boolean;
  dependencies: Array<{ id: string; name: string; status: TodoStatus }>;
  dependents: Array<{ id: string; name: string; status: TodoStatus }>;
};

export type TodoListResponse = {
  items: TodoSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  nextCursor: string | null;
};

export type DashboardResponse = {
  total: number;
  byStatus: Record<TodoStatus, number>;
  byPriority: Record<TodoPriority, number>;
  dependencyHealth: { blocked: number; unblocked: number };
  upcoming: TodoSummary[];
};

export type ApiSuccess<T> = { data: T };
export type ApiFailure = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || "error" in payload) {
    const error = "error" in payload ? payload.error : undefined;
    throw new ApiClientError(
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Request failed",
      response.status,
      error?.details,
    );
  }

  return payload.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  return parseResponse<T>(response);
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

export const STATUS_LABELS: Record<TodoStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const PRIORITY_LABELS: Record<TodoPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

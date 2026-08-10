export function buildOpenApiDocument() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    openapi: "3.0.3",
    info: {
      title: "SleekFlow TODO API",
      version: "1.0.0",
      description:
        "REST API for the SleekFlow Software Engineer interview TODO assessment. Soft delete, recurrence, dependencies, filtering, sorting, and optimistic concurrency are supported.",
    },
    servers: [{ url: appUrl }],
    tags: [
      { name: "Todos" },
      { name: "Dashboard" },
      { name: "Calendar" },
    ],
    paths: {
      "/api/todos": {
        get: {
          tags: ["Todos"],
          summary: "List todos with filter, sort, and pagination",
          parameters: [
            { name: "status", in: "query", schema: { $ref: "#/components/schemas/TodoStatus" } },
            { name: "priority", in: "query", schema: { $ref: "#/components/schemas/TodoPriority" } },
            { name: "dueAfter", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "dueBefore", in: "query", schema: { type: "string", format: "date-time" } },
            {
              name: "dependencyStatus",
              in: "query",
              schema: { type: "string", enum: ["blocked", "unblocked"] },
            },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "onlyDeleted", in: "query", schema: { type: "string", enum: ["true", "false"] } },
            {
              name: "sortBy",
              in: "query",
              schema: {
                type: "string",
                enum: ["dueDate", "priority", "status", "name", "createdAt", "dependency"],
              },
            },
            {
              name: "sortOrder",
              in: "query",
              schema: { type: "string", enum: ["asc", "desc"] },
            },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            },
            {
              name: "cursor",
              in: "query",
              description: "Opaque keyset cursor from a previous nextCursor",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Paginated todo list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TodoListResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/Error" },
          },
        },
        post: {
          tags: ["Todos"],
          summary: "Create a todo",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateTodoRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Created todo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TodoResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/Error" },
          },
        },
      },
      "/api/todos/{id}": {
        get: {
          tags: ["Todos"],
          summary: "Get a todo by id",
          parameters: [{ $ref: "#/components/parameters/TodoId" }],
          responses: {
            "200": {
              description: "Todo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TodoResponse" },
                },
              },
            },
            "404": { $ref: "#/components/responses/Error" },
          },
        },
        patch: {
          tags: ["Todos"],
          summary: "Update a todo (requires version)",
          parameters: [{ $ref: "#/components/parameters/TodoId" }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateTodoRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Updated todo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TodoResponse" },
                },
              },
            },
            "400": { $ref: "#/components/responses/Error" },
            "404": { $ref: "#/components/responses/Error" },
            "409": { $ref: "#/components/responses/Error" },
          },
        },
        delete: {
          tags: ["Todos"],
          summary: "Soft delete a todo",
          parameters: [{ $ref: "#/components/parameters/TodoId" }],
          responses: {
            "200": {
              description: "Soft-deleted todo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TodoResponse" },
                },
              },
            },
            "404": { $ref: "#/components/responses/Error" },
          },
        },
      },
      "/api/todos/{id}/restore": {
        post: {
          tags: ["Todos"],
          summary: "Restore a soft-deleted todo",
          parameters: [{ $ref: "#/components/parameters/TodoId" }],
          responses: {
            "200": {
              description: "Restored todo",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TodoResponse" },
                },
              },
            },
            "404": { $ref: "#/components/responses/Error" },
          },
        },
      },
      "/api/dashboard": {
        get: {
          tags: ["Dashboard"],
          summary: "Dashboard aggregates and upcoming work",
          responses: {
            "200": {
              description: "Dashboard payload",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardResponse" },
                },
              },
            },
          },
        },
      },
      "/api/calendar": {
        get: {
          tags: ["Calendar"],
          summary: "Todos in a due-date range",
          parameters: [
            {
              name: "start",
              in: "query",
              required: true,
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "end",
              in: "query",
              required: true,
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: {
            "200": {
              description: "Todos in range",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Todo" },
                      },
                    },
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/Error" },
          },
        },
      },
      "/api/openapi": {
        get: {
          tags: ["Dashboard"],
          summary: "OpenAPI document",
          responses: {
            "200": {
              description: "OpenAPI JSON",
            },
          },
        },
      },
    },
    components: {
      parameters: {
        TodoId: {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      },
      responses: {
        Error: {
          description: "Error envelope",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
            },
          },
        },
      },
      schemas: {
        TodoStatus: {
          type: "string",
          enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"],
        },
        TodoPriority: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
        },
        Todo: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            dueDate: { type: "string", format: "date-time" },
            status: { $ref: "#/components/schemas/TodoStatus" },
            priority: { $ref: "#/components/schemas/TodoPriority" },
            isRecurring: { type: "boolean" },
            recurrenceFrequency: {
              type: "string",
              nullable: true,
              enum: ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM", null],
            },
            recurrenceInterval: { type: "integer", nullable: true },
            recurrenceUnit: {
              type: "string",
              nullable: true,
              enum: ["DAYS", "WEEKS", "MONTHS", null],
            },
            version: { type: "integer" },
            isBlocked: { type: "boolean" },
            dependencies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  status: { $ref: "#/components/schemas/TodoStatus" },
                },
              },
            },
          },
        },
        CreateTodoRequest: {
          type: "object",
          required: ["name", "dueDate"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            dueDate: { type: "string", format: "date-time" },
            status: { $ref: "#/components/schemas/TodoStatus" },
            priority: { $ref: "#/components/schemas/TodoPriority" },
            dependencyIds: { type: "array", items: { type: "string" } },
            isRecurring: { type: "boolean" },
            recurrenceFrequency: {
              type: "string",
              enum: ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"],
            },
            recurrenceInterval: { type: "integer", minimum: 1 },
            recurrenceUnit: {
              type: "string",
              enum: ["DAYS", "WEEKS", "MONTHS"],
            },
          },
        },
        UpdateTodoRequest: {
          allOf: [
            { $ref: "#/components/schemas/CreateTodoRequest" },
            {
              type: "object",
              required: ["version"],
              properties: {
                version: { type: "integer", minimum: 1 },
              },
            },
          ],
        },
        TodoResponse: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/Todo" },
          },
        },
        TodoListResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Todo" },
                },
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" },
              },
            },
          },
        },
        DashboardResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                total: { type: "integer" },
                byStatus: { type: "object" },
                byPriority: { type: "object" },
                dependencyHealth: {
                  type: "object",
                  properties: {
                    blocked: { type: "integer" },
                    unblocked: { type: "integer" },
                  },
                },
                upcoming: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Todo" },
                },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: {},
              },
              required: ["code", "message"],
            },
          },
        },
      },
    },
  };
}

import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";
import {
  getTodo,
  softDeleteTodo,
  updateTodo,
} from "@/features/todos/todo.service";
import { updateTodoSchema } from "@/features/todos/todo.schemas";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const todo = await getTodo(id, user);
    return ok(todo);
  } catch (error) {
    return fromAppError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const body = await request.json();
    const input = updateTodoSchema.parse(body);
    const todo = await updateTodo(id, input, user);
    return ok(todo);
  } catch (error) {
    return fromAppError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const todo = await softDeleteTodo(id, user);
    return ok(todo);
  } catch (error) {
    return fromAppError(error);
  }
}

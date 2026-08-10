import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";
import { createTodo, listTodos } from "@/features/todos/todo.service";
import {
  createTodoSchema,
  listTodosQuerySchema,
} from "@/features/todos/todo.schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const query = listTodosQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    const result = await listTodos(query, user);
    return ok(result);
  } catch (error) {
    return fromAppError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const input = createTodoSchema.parse(body);
    const todo = await createTodo(input, user);
    return ok(todo, 201);
  } catch (error) {
    return fromAppError(error);
  }
}

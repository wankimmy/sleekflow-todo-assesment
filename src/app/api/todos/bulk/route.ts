import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";
import { bulkTodos } from "@/features/todos/todo.service";
import { bulkTodosSchema } from "@/features/todos/todo.schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const input = bulkTodosSchema.parse(body);
    const result = await bulkTodos(input, user);
    return ok(result);
  } catch (error) {
    return fromAppError(error);
  }
}

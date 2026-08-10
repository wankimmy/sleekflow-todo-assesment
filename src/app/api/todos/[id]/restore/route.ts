import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";
import { restoreTodo } from "@/features/todos/todo.service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    const { id } = await context.params;
    const todo = await restoreTodo(id, user);
    return ok(todo);
  } catch (error) {
    return fromAppError(error);
  }
}

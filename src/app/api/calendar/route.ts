import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";
import { getCalendarTodos } from "@/features/todos/todo.service";
import { calendarQuerySchema } from "@/features/todos/todo.schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    const { searchParams } = new URL(request.url);
    const query = calendarQuerySchema.parse(
      Object.fromEntries(searchParams.entries()),
    );
    const todos = await getCalendarTodos(query.start, query.end, user);
    return ok(todos);
  } catch (error) {
    return fromAppError(error);
  }
}

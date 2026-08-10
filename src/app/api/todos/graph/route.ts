import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";
import { getGraph } from "@/features/todos/todo.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const graph = await getGraph(user);
    return ok(graph);
  } catch (error) {
    return fromAppError(error);
  }
}

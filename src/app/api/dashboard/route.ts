import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";
import { getDashboard } from "@/features/todos/todo.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const dashboard = await getDashboard(user);
    return ok(dashboard);
  } catch (error) {
    return fromAppError(error);
  }
}

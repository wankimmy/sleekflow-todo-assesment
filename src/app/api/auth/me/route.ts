import { fromAppError, ok } from "@/lib/api-response";
import { getCurrentUser } from "@/features/auth/auth.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return ok(user);
  } catch (error) {
    return fromAppError(error);
  }
}

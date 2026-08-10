import { fromAppError, ok } from "@/lib/api-response";
import { logoutCurrentSession } from "@/features/auth/auth.service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await logoutCurrentSession();
    return ok({ ok: true });
  } catch (error) {
    return fromAppError(error);
  }
}

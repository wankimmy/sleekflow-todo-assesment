import { cookies } from "next/headers";
import { fromAppError, ok } from "@/lib/api-response";
import {
  loginSchema,
  loginUser,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/features/auth/auth.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = loginSchema.parse(body);
    const { user, rawToken, expiresAt } = await loginUser(input);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, rawToken, sessionCookieOptions(expiresAt));
    return ok(user);
  } catch (error) {
    return fromAppError(error);
  }
}

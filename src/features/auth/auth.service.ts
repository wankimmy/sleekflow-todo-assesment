import { createHash, randomBytes } from "crypto";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { AppError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const SESSION_COOKIE = "sleekflow_session";
const SESSION_DAYS = 14;

export const registerSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerUser(input: z.infer<typeof registerSchema>) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });
  if (existing) {
    throw new AppError("EMAIL_TAKEN", "Email is already registered", 409);
  }

  const passwordHash = await hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
    },
  });

  return createSessionForUser(user.id);
}

export async function loginUser(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });
  if (!user) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  const valid = await compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  return createSessionForUser(user.id);
}

async function createSessionForUser(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await prisma.session.create({
    data: {
      token: tokenHash,
      userId,
      expiresAt,
    },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  return { user, rawToken, expiresAt };
}

export async function logoutCurrentSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (rawToken) {
    await prisma.session.deleteMany({
      where: { token: hashToken(rawToken) },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token: hashToken(rawToken) },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  return session.user;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function assertCanWriteTodo(
  todo: { ownerId: string | null },
  user: AuthUser | null,
) {
  if (todo.ownerId === null) {
    return;
  }
  if (!user || user.id !== todo.ownerId) {
    throw new AppError(
      "FORBIDDEN",
      "You can only modify todos you own (or shared-board todos)",
      403,
    );
  }
}

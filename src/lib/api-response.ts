import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
  return NextResponse.json(body, { status });
}

export function fromZodError(error: ZodError) {
  return fail(
    "VALIDATION_ERROR",
    "Request validation failed",
    400,
    error.flatten(),
  );
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function fromAppError(error: unknown) {
  if (error instanceof AppError) {
    return fail(error.code, error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    return fromZodError(error);
  }

  console.error(error);
  return fail("INTERNAL_ERROR", "Unexpected server error", 500);
}

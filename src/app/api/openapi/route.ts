import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  // Scalar (and other OpenAPI renderers) expect the raw document, not the app success envelope.
  return NextResponse.json(buildOpenApiDocument());
}

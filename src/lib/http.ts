import { NextResponse } from "next/server";
import { z } from "zod";

// Parses a JSON request body. Returns undefined on malformed JSON so callers
// can respond with a 400 instead of crashing with an unhandled 500.
export async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function invalidJsonResponse(): NextResponse {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
}

export function validationErrorResponse(error: z.ZodError): NextResponse {
  const message = error.issues.map((issue) => issue.message).join("; ");
  return NextResponse.json({ error: message }, { status: 400 });
}

// Common field shapes used across API routes.
export const uuidString = z.string().min(1, "Required");
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date (expected YYYY-MM-DD)");
export const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Invalid time (expected HH:MM)");

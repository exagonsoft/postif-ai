import { isValidObjectId } from "mongoose";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, `${field} is required.`);
  return value.trim();
}

export function optionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ApiError(400, `${field} must be a string.`);
  return value.trim() || undefined;
}

export function requiredId(value: unknown, field: string) {
  const id = requiredString(value, field);
  if (!isValidObjectId(id)) throw new ApiError(400, `${field} must be a valid identifier.`);
  return id;
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  const status = message === "MONGODB_URI is not configured." ? 503 : 500;
  return Response.json({ error: message }, { status });
}

export function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
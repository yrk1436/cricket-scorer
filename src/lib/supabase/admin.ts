import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseUrl } from "@/lib/env";

let cachedClient: SupabaseClient | null = null;

export function createSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export class DatabaseConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

export async function wrapSupabaseCall<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
  context: string,
): Promise<T> {
  try {
    const result = await operation();
    if (result.error) {
      throw new Error(result.error.message);
    }
    if (result.data === null) {
      throw new Error(`No data returned from ${context}`);
    }
    return result.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("fetch failed") ||
      message.includes("ENOTFOUND") ||
      message.includes("ECONNREFUSED") ||
      message.includes("network")
    ) {
      throw new DatabaseConnectionError(
        "Database connection failed. The database may be temporarily unavailable. Please try again later or contact support if the issue persists.",
      );
    }
    throw err;
  }
}

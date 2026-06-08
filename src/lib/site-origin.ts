import { headers } from "next/headers";

/** Base URL for read-only links in emails/UI (optional env override). */
export async function getRequestOrigin(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const xfProto = h.get("x-forwarded-proto");
  const proto =
    xfProto ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`;
}

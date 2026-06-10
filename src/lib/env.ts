function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function getSupabaseUrl() {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getServiceRoleKey() {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getUnlockSecret() {
  return requireEnv("MATCH_UNLOCK_SECRET");
}

export function getAdminSecret() {
  return requireEnv("ADMIN_SECRET");
}

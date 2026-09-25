import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { blockingProblems } from "../env-check";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS: use only in route handlers AFTER validating
 * the bot key + origin (widget endpoints) or an admin session (dashboard).
 */
export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const problems = blockingProblems().filter((p) => p.name.includes("SUPABASE"));
  if (problems.length) throw new Error(`Botly is not configured: ${problems.map((p) => `${p.name} ${p.problem}`).join("; ")}. Run \`npm run check\`.`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

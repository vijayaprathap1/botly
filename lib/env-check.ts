/**
 * Format-only checks of the environment (no network). Used by the proxy to show
 * a setup page instead of crashing, by /api/health, and by `npm run check`.
 * Returns problems by variable NAME only — never echoes values.
 */
export type EnvProblem = { name: string; problem: string; fix: string };

const PLACEHOLDER = /^(|\.{3}|.*YOUR[-_]PROJECT.*|sk-ant-\.\.\.|re_\.\.\.|changeme|xxx+)$/i;

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

export function checkEnv(env: Record<string, string | undefined> = process.env): EnvProblem[] {
  const out: EnvProblem[] = [];
  const v = (k: string) => (env[k] ?? "").trim();
  const need = (k: string, fix: string) => {
    if (PLACEHOLDER.test(v(k))) out.push({ name: k, problem: v(k) ? "still a placeholder" : "missing", fix });
  };

  need("NEXT_PUBLIC_SUPABASE_URL", "Supabase → Project Settings → API → Project URL (looks like https://abcdefghijklmnop.supabase.co)");
  need("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase → Project Settings → API keys → anon / publishable key");
  need("SUPABASE_SERVICE_ROLE_KEY", "Supabase → Project Settings → API keys → service_role / secret key (keep it server-only)");
  need("ANTHROPIC_API_KEY", "console.anthropic.com → API Keys (starts with sk-ant-)");
  need("NEXT_PUBLIC_APP_URL", "http://localhost:3000 locally, your https domain in production");
  need("ADMIN_EMAILS", "the email address you sign in with");

  const url = v("NEXT_PUBLIC_SUPABASE_URL");
  if (url && !PLACEHOLDER.test(url) && !/^https?:\/\/[^/]+$/.test(url.replace(/\/+$/, ""))) {
    out.push({ name: "NEXT_PUBLIC_SUPABASE_URL", problem: "not a bare URL", fix: "Use only the project URL, e.g. https://abcdefghijklmnop.supabase.co (no /rest/v1 or trailing path)" });
  }
  const anon = v("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = v("SUPABASE_SERVICE_ROLE_KEY");
  if (anon && !PLACEHOLDER.test(anon)) {
    const role = jwtRole(anon);
    if (anon.startsWith("sb_secret_") || role === "service_role") out.push({ name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", problem: "this is the SECRET key", fix: "Swap them: the anon/publishable key goes here, the secret one in SUPABASE_SERVICE_ROLE_KEY" });
    else if (!anon.startsWith("sb_publishable_") && role !== "anon") out.push({ name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", problem: "doesn't look like a Supabase anon key", fix: "Copy the anon (eyJ…) or publishable (sb_publishable_…) key" });
  }
  if (service && !PLACEHOLDER.test(service)) {
    const role = jwtRole(service);
    if (service.startsWith("sb_publishable_") || role === "anon") out.push({ name: "SUPABASE_SERVICE_ROLE_KEY", problem: "this is the PUBLIC anon key", fix: "Use the service_role (eyJ…) or secret (sb_secret_…) key" });
    else if (!service.startsWith("sb_secret_") && role !== "service_role") out.push({ name: "SUPABASE_SERVICE_ROLE_KEY", problem: "doesn't look like a Supabase service key", fix: "Copy the service_role (eyJ…) or secret (sb_secret_…) key" });
  }
  const ak = v("ANTHROPIC_API_KEY");
  if (ak && !PLACEHOLDER.test(ak) && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(ak)) out.push({ name: "ANTHROPIC_API_KEY", problem: "doesn't look like an Anthropic key", fix: "It starts with sk-ant- and is ~100 characters" });
  const rk = v("RESEND_API_KEY");
  if (rk && !/^re_[A-Za-z0-9_]{10,}$/.test(rk)) out.push({ name: "RESEND_API_KEY", problem: "placeholder or malformed (optional)", fix: "resend.com → API Keys, or delete the line to run without lead emails" });
  const app = v("NEXT_PUBLIC_APP_URL");
  if (app && !/^https?:\/\/[^/]+$/.test(app.replace(/\/+$/, ""))) out.push({ name: "NEXT_PUBLIC_APP_URL", problem: "not a bare URL", fix: "e.g. http://localhost:3000" });
  return out;
}

const NON_BLOCKING = new Set(["RESEND_API_KEY", "ANTHROPIC_API_KEY"]);

/** Problems that stop the dashboard and database from working (Supabase + URLs). */
export const blockingProblems = (env?: Record<string, string | undefined>) => checkEnv(env).filter((p) => !NON_BLOCKING.has(p.name));

/** Problems that break a feature but not the app: no Anthropic key → no AI replies; no Resend → no lead emails. */
export function featureProblems(env: Record<string, string | undefined> = process.env): EnvProblem[] {
  if (env.BOTLY_TEST_SCRIPTED_LLM === "1") return checkEnv(env).filter((p) => p.name === "RESEND_API_KEY");
  return checkEnv(env).filter((p) => NON_BLOCKING.has(p.name));
}

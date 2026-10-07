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
  const openaiCompat = ["nvidia", "gemini", "groq", "cerebras", "mistral", "github", "openrouter", "openai", "openai-compatible"].includes(v("LLM_PROVIDER").trim().toLowerCase());
  if (openaiCompat) {
    if (["LLM_API_KEY", "NVIDIA_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "MISTRAL_API_KEY", "GITHUB_TOKEN", "OPENROUTER_API_KEY"].every((k) => PLACEHOLDER.test(v(k))))
      out.push({ name: "LLM_API_KEY", problem: v("LLM_API_KEY") ? "still a placeholder" : "missing", fix: "Gemini: aistudio.google.com/apikey · Groq: console.groq.com/keys · Cerebras: cloud.cerebras.ai · Mistral: console.mistral.ai/api-keys · GitHub: github.com/settings/personal-access-tokens · OpenRouter: openrouter.ai/keys" });
    if (v("LLM_PROVIDER").trim().toLowerCase() === "openrouter" && !v("LLM_MODEL").trim())
      out.push({ name: "LLM_API_KEY", problem: "OpenRouter needs a model", fix: "Set LLM_MODEL to a free model id from openrouter.ai/models?max_price=0 (ends in :free)" });
  } else need("ANTHROPIC_API_KEY", "console.anthropic.com → API Keys (starts with sk-ant-), or set LLM_PROVIDER=nvidia with LLM_API_KEY");
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
  if (!openaiCompat && ak && !PLACEHOLDER.test(ak) && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(ak)) out.push({ name: "ANTHROPIC_API_KEY", problem: "doesn't look like an Anthropic key", fix: "It starts with sk-ant- and is ~100 characters" });
  const rk = v("RESEND_API_KEY");
  // Without Resend nothing breaks, but no lead, invite, trial or alert email is ever sent: say so.
  if (!rk) out.push({ name: "RESEND_API_KEY", problem: "missing (optional)", fix: "resend.com → API Keys. Until it is set, leads are saved but nobody is emailed" });
  else if (!/^re_[A-Za-z0-9_]{10,}$/.test(rk)) out.push({ name: "RESEND_API_KEY", problem: "placeholder or malformed (optional)", fix: "resend.com → API Keys, or delete the line to run without lead emails" });
  // Payments (optional until you sell): all four together, and test/live keys not mixed up.
  const rzp = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_PLAN_STARTER", "RAZORPAY_PLAN_GROWTH", "RAZORPAY_WEBHOOK_SECRET"];
  const rzpSet = rzp.filter((k) => !PLACEHOLDER.test(v(k)));
  if (rzpSet.length === 0) out.push({ name: "RAZORPAY", problem: "not set up", fix: "Customers can't pay yet. README → Payments (Razorpay)" });
  else if (rzpSet.length < rzp.length) out.push({ name: "RAZORPAY", problem: `missing ${rzp.filter((k) => !rzpSet.includes(k)).join(", ")}`, fix: "README → Payments (Razorpay)" });
  const kid = v("RAZORPAY_KEY_ID");
  if (kid && !PLACEHOLDER.test(kid) && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(kid)) out.push({ name: "RAZORPAY", problem: "RAZORPAY_KEY_ID doesn't look like a Razorpay key id", fix: "It starts with rzp_test_ or rzp_live_" });
  for (const k of ["RAZORPAY_PLAN_STARTER", "RAZORPAY_PLAN_GROWTH"]) {
    const pv = v(k);
    if (pv && !PLACEHOLDER.test(pv) && !/^plan_[A-Za-z0-9_]+$/.test(pv)) out.push({ name: "RAZORPAY", problem: `${k} isn't a plan id`, fix: "Copy the id that starts with plan_ from Subscriptions → Plans" });
  }
  const app = v("NEXT_PUBLIC_APP_URL");
  if (app && !/^https?:\/\/[^/]+$/.test(app.replace(/\/+$/, ""))) out.push({ name: "NEXT_PUBLIC_APP_URL", problem: "not a bare URL", fix: "e.g. http://localhost:3000" });
  return out;
}

const NON_BLOCKING = new Set(["RESEND_API_KEY", "ANTHROPIC_API_KEY", "LLM_API_KEY", "RAZORPAY"]);
/** Env problems that mean the assistant can't reply. */
export const AI_KEY_NAMES = ["ANTHROPIC_API_KEY", "LLM_API_KEY"];

/** Problems that stop the dashboard and database from working (Supabase + URLs). */
export const blockingProblems = (env?: Record<string, string | undefined>) => checkEnv(env).filter((p) => !NON_BLOCKING.has(p.name));

/** Problems that break a feature but not the app: no Anthropic key → no AI replies; no Resend → no lead emails. */
export function featureProblems(env: Record<string, string | undefined> = process.env): EnvProblem[] {
  if (env.BOTLY_TEST_SCRIPTED_LLM === "1") return checkEnv(env).filter((p) => p.name === "RESEND_API_KEY");
  return checkEnv(env).filter((p) => NON_BLOCKING.has(p.name));
}

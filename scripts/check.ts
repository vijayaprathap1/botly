/**
 * Setup doctor:  npm run check
 * Verifies .env.local and that Supabase, the migrations, the seed, Anthropic and
 * Resend actually answer. Prints fixes. Never prints secret values.
 *   --quick   format checks only (used automatically by `npm run dev`)
 */
import { existsSync, readFileSync } from "node:fs";
import { checkEnv } from "../lib/env-check";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const raw of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(raw);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}
const quick = process.argv.includes("--quick");
const ok = (s: string) => console.log(`  \x1b[32m✔\x1b[0m ${s}`);
const bad = (s: string, fix?: string) => console.log(`  \x1b[31m✘\x1b[0m ${s}${fix ? `\n      → ${fix}` : ""}`);
const warn = (s: string, fix?: string) => console.log(`  \x1b[33m!\x1b[0m ${s}${fix ? `\n      → ${fix}` : ""}`);
let failures = 0;

async function main() {
  console.log("\nBotly setup check\n");
  if (!existsSync(".env.local")) bad(".env.local not found", "Copy .env.example to .env.local and fill it in");
  const problems = checkEnv();
  for (const p of problems) {
    if (p.name === "RESEND_API_KEY") warn(`${p.name}: ${p.problem}`, p.fix);
    else {
      bad(`${p.name}: ${p.problem}`, p.fix);
      failures++;
    }
  }
  if (!problems.length) ok("Environment variables look right");
  if (quick) {
    if (failures) console.log(`\n\x1b[31m${failures} setting(s) must be fixed in .env.local, then restart npm run dev.\x1b[0m Run \`npm run check\` for a full test.\n`);
    return;
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const bad_ = problems.map((p) => p.name);

  if (!bad_.includes("NEXT_PUBLIC_SUPABASE_URL") && !bad_.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    const rest = (path: string, key = service) =>
      fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    try {
      const r = await rest("bots?select=id,name,public_key&limit=5");
      const body = await r.text();
      if (r.ok) {
        ok("Supabase reachable, service key accepted, migrations applied (bots table exists)");
        const bots = JSON.parse(body) as { name: string; public_key: string }[];
        if (bots.length) ok(`${bots.length} bot(s) found, e.g. "${bots[0]!.name}" (${bots[0]!.public_key})`);
        else warn("No bots yet", "Run supabase/seed.sql for the demo, or create a client in the dashboard");
        for (const t of ["usage_monthly", "rate_limits", "eval_runs", "notifications"]) {
          const x = await rest(`${t}?select=id&limit=1`);
          if (!x.ok) {
            bad(`Table ${t} missing`, "Run migrations 0001, 0002, 0003 in order");
            failures++;
          }
        }
        const phase = async (file: string, tables: string[]) => {
          const missing: string[] = [];
          for (const t of tables) if (!(await rest(`${t}?select=id&limit=1`)).ok) missing.push(t);
          if (missing.length) {
            bad(`${file} not applied (missing ${missing.join(", ")})`, `Supabase → SQL Editor: run supabase/migrations/${file}`);
            failures++;
          } else ok(`${file} applied`);
        };
        await phase("0004_phase2.sql", ["org_invites", "knowledge_chunks"]);
        await phase("0005_phase3.sql", ["bot_integrations"]);
        const fn = await fetch(`${url}/rest/v1/rpc/rate_limit_hit`, {
          method: "POST",
          headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_key: "setup-check", p_limit: 1000, p_window_seconds: 60 }),
        });
        if (fn.ok) ok("Database functions installed (0002_functions.sql)");
        else {
          bad("Database functions missing", "Run supabase/migrations/0002_functions.sql in the SQL editor");
          failures++;
        }
        if (anon) {
          const a = await rest("bots?select=id&limit=1", anon);
          const rows = a.ok ? ((await a.json()) as unknown[]) : [];
          if (a.status === 401) {
            bad("Anon key rejected by Supabase", "Recopy NEXT_PUBLIC_SUPABASE_ANON_KEY from the same project");
            failures++;
          } else if (rows.length) {
            bad("Anonymous users can read bots: row-level security is not on", "Run supabase/migrations/0003_rls.sql");
            failures++;
          } else ok("Row-level security on (anonymous users see nothing)");
        }
      } else if (r.status === 401 || /JWT|Invalid API key/i.test(body)) {
        bad("Supabase rejected the service key", "Recopy SUPABASE_SERVICE_ROLE_KEY from the same project as the URL");
        failures++;
      } else if (/PGRST20[25]|does not exist|schema cache/i.test(body)) {
        bad("Migrations not applied (no bots table)", "Supabase → SQL Editor: run 0001_schema.sql, 0002_functions.sql, 0003_rls.sql in order, then seed.sql");
        failures++;
      } else {
        bad(`Supabase answered ${r.status}: ${body.slice(0, 160)}`);
        failures++;
      }
    } catch (e) {
      bad(`Can't reach Supabase at ${url}: ${e instanceof Error ? e.message : e}`, "Check the project URL and that the project isn't paused");
      failures++;
    }
    try {
      const s = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon || service }, signal: AbortSignal.timeout(10_000) });
      if (s.ok) {
        const st = (await s.json()) as { external?: { email?: boolean } };
        if (st.external?.email === false) {
          bad("Email sign-in is disabled in Supabase", "Authentication → Sign In / Providers → enable Email");
          failures++;
        } else ok("Supabase Auth reachable, email sign-in enabled");
        warn(`Make sure ${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback is in Authentication → URL Configuration → Redirect URLs`);
      }
    } catch {
      /* already reported above */
    }
  }

  if (!bad_.includes("ANTHROPIC_API_KEY")) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) ok("Anthropic key works");
      else {
        const msg = ((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
        bad(`Anthropic rejected the key (${r.status})${msg ? `: ${msg}` : ""}`, r.status === 401 ? "Create a new key at console.anthropic.com" : "Check the key's workspace and billing/credits at console.anthropic.com");
        failures++;
      }
    } catch (e) {
      bad(`Can't reach Anthropic: ${e instanceof Error ? e.message : e}`);
      failures++;
    }
  }

  const rk = process.env.RESEND_API_KEY;
  if (rk && !bad_.includes("RESEND_API_KEY")) {
    try {
      const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${rk}` }, signal: AbortSignal.timeout(10_000) });
      const body = await r.text();
      if (r.ok || /restricted_api_key/.test(body)) ok("Resend key works (lead emails on)");
      else warn(`Resend rejected the key (${r.status})`, "Leads are still saved; emails won't send until this is fixed");
    } catch {
      warn("Can't reach Resend");
    }
  } else if (!rk) warn("RESEND_API_KEY not set: leads are saved but not emailed");

  console.log(failures ? `\n\x1b[31m${failures} problem(s) to fix.\x1b[0m After editing .env.local, stop and restart \`npm run dev\`.\n` : "\n\x1b[32mAll good.\x1b[0m Start with: npm run dev\n");
  process.exitCode = failures ? 1 : 0;
}
main();

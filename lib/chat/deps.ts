import "server-only";
import { getLlm } from "../llm";
import { defaultNotifiers } from "../notify/dispatch";
import { PostgresRateLimiter } from "../security/rate-limit";
import { supabaseAdmin } from "../supabase/admin";
import type { EngineDeps } from "./engine";
import { SupabaseStore } from "./supabase-store";
import { SupabaseRetriever } from "../retrieval/retriever";
import { loadOrderProvider } from "../orders";

export function serverDeps(): EngineDeps {
  const db = supabaseAdmin();
  const llm = getLlm();
  return { store: new SupabaseStore(db), llm, limiter: new PostgresRateLimiter(db), notifiers: defaultNotifiers(), retriever: new SupabaseRetriever(db, llm), orders: (botId) => loadOrderProvider(db, botId) };
}

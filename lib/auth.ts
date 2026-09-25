import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { blockingProblems } from "./env-check";
import { supabaseServer } from "./supabase/server";

export type Session = { userId: string; email: string | null; isAdmin: boolean; orgIds: string[] };

/** Current dashboard user and role, or null. Cached per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  if (blockingProblems().length) return null;
  const sb = await supabaseServer();
  let data;
  try {
    ({ data } = await sb.auth.getUser());
  } catch (e) {
    console.error("[auth] Supabase unreachable:", e instanceof Error ? e.message : e);
    return null;
  }
  if (!data.user) return null;
  const { data: rows } = await sb.from("memberships").select("role, org_id").eq("user_id", data.user.id);
  const memberships = (rows ?? []) as { role: string; org_id: string | null }[];
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    isAdmin: memberships.some((m) => m.role === "admin"),
    orgIds: memberships.map((m) => m.org_id).filter((x): x is string => Boolean(x)),
  };
});

export async function requireSession(): Promise<Session> {
  if (blockingProblems().length) redirect("/setup");
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!s.isAdmin) redirect("/app");
  return s;
}

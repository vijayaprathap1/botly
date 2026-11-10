import { after } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveAccess } from "@/lib/chat/access";
import { runChat, type ChatEventName } from "@/lib/chat/engine";
import { serverDeps } from "@/lib/chat/deps";
import { clientIp, corsHeaders, json, preflight, readJsonBody } from "@/lib/http";
import { requestOrigin } from "@/lib/security/origin";
import { chatRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = preflight;

/**
 * POST /api/chat → Server-Sent Events:
 *   meta {conversationId}, delta {text}, tool_card {...}, suggestions {questions},
 *   debug {...} (admin playground only), done {conversationId}, error {code, message}
 */
export async function POST(req: Request) {
  // CORS echoes the browser's Origin header; access uses the page origin (same-origin fallback).
  const origin = req.headers.get("origin");
  const pageOrigin = requestOrigin(req);
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(req, { error: { code: "bad_request", message: "Invalid JSON" } }, 400);
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(req, { error: { code: "bad_request", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, 400);
  }
  const input = parsed.data;
  // Debug data (cost, tokens, knowledge) only for a signed-in admin in the playground.
  const debug = Boolean(input.debug) && Boolean((await getSession().catch(() => null))?.isAdmin);

  let deps: ReturnType<typeof serverDeps>;
  try {
    deps = serverDeps();
  } catch (e) {
    console.error("[api/chat] not configured:", e instanceof Error ? e.message : e);
    return json(req, { error: { code: "server_error", message: "Chat is not available right now." } }, 503);
  }
  // Origin lock, before any streaming: a page that isn't on the bot's allowed domains gets a
  // plain 403 (test links and the dashboard preview pass with their test token instead).
  let bot: Awaited<ReturnType<typeof deps.store.getBotByKey>>;
  try {
    bot = await deps.store.getBotByKey(input.key);
  } catch (e) {
    console.error("[api/chat] bot lookup failed:", e instanceof Error ? e.message : e);
    return json(req, { error: { code: "server_error", message: "Chat is not available right now." } }, 503);
  }
  if (!bot) return json(req, { error: { code: "not_found", message: "This chat isn't available." } }, 404);
  const access = resolveAccess(bot, pageOrigin, input.testToken);
  if (!access.allowed && (access.reason === "origin" || access.reason === "bad_token")) {
    return json(req, { error: { code: access.reason, message: "This chat isn't available on this website.", origin: pageOrigin } }, 403);
  }
  const encoder = new TextEncoder();
  let resolveJobs: (jobs: (() => Promise<void>)[]) => void = () => {};
  const jobs = new Promise<(() => Promise<void>)[]>((r) => (resolveJobs = r));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEventName, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client went away; keep going so the reply is still saved */
        }
      };
      controller.enqueue(encoder.encode(": botly\n\n"));
      try {
        const out = await runChat(deps, input, { origin: pageOrigin, ip: clientIp(req), debug, bot }, send);
        resolveJobs(out.jobs);
      } catch (e) {
        console.error("[api/chat]", e instanceof Error ? e.message : e);
        send("error", { code: "server_error", message: "Something went wrong. Please try again." });
        resolveJobs([]);
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  // Notifications run after the stream has finished; they never delay the reply.
  after(async () => {
    for (const job of await jobs) await job().catch((e) => console.error("[api/chat] job failed", e));
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

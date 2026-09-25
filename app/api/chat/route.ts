import { after } from "next/server";
import { getSession } from "@/lib/auth";
import { runChat, type ChatEventName } from "@/lib/chat/engine";
import { serverDeps } from "@/lib/chat/deps";
import { clientIp, corsHeaders, json, preflight, readJsonBody } from "@/lib/http";
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
  const origin = req.headers.get("origin");
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
        const out = await runChat(deps, input, { origin, ip: clientIp(req), debug }, send);
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

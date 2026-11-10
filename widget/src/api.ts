export type WidgetConfig = {
  enabled: true;
  test: boolean;
  business: string;
  assistantName: string;
  avatarUrl: string | null;
  primaryColor: string;
  position: "left" | "right";
  theme: "light" | "dark" | "auto";
  showPoweredBy: boolean;
  greeting: string;
  nudge: string | null;
  suggestions: string[];
  isOpen: boolean;
  privacyUrl: string;
  fallbackContact: { phone?: string; email?: string; whatsapp?: string };
  quotaExceeded: boolean;
};

export type ChatHandlers = {
  onEvent: (event: string, data: any) => void;
};

export class Api {
  constructor(private base: string, private key: string, private testToken: string | null) {}

  private q(extra: Record<string, string> = {}) {
    const p = new URLSearchParams({ key: this.key, ...extra });
    if (this.testToken) p.set("t", this.testToken);
    return p.toString();
  }

  async config(): Promise<WidgetConfig | null> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/api/widget/config?${this.q()}`, { credentials: "omit", referrerPolicy: "strict-origin" });
    } catch {
      // Blocked before it reached Botly: a Content-Security-Policy, an ad blocker or the network.
      warnOnce(
        "network",
        `[Botly] Chat widget not shown: couldn't reach ${this.base}. If the site has a Content-Security-Policy, allow ${this.base} in script-src and connect-src (and font-src for fonts).`,
      );
      return null;
    }
    let data: { enabled?: boolean; reason?: string; origin?: string | null } | null = null;
    try {
      data = await res.json();
    } catch {
      return null;
    }
    // 403 (domain not allowed), 404 (unknown key) and 200 {enabled:false} all carry a reason.
    if (data && !data.enabled && data.reason) devHint(data.reason, data.origin ?? "");
    if (!res.ok) return null;
    return data && data.enabled ? (data as WidgetConfig) : null;
  }

  async history(visitorId: string, conversationId: string) {
    const res = await fetch(`${this.base}/api/widget/history?${this.q({ visitorId, conversationId })}`, { credentials: "omit", referrerPolicy: "strict-origin" });
    if (!res.ok) return { messages: [] as { role: string; content: string; at: string }[] };
    return (await res.json()) as { status?: string; hasLead?: boolean; messages: { role: string; content: string; at: string }[] };
  }

  async lead(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; field?: string; conversationId?: string | null }> {
    const res = await fetch(`${this.base}/api/widget/lead`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ key: this.key, testToken: this.testToken, ...body }),
    });
    try {
      return await res.json();
    } catch {
      return { ok: false, error: "Couldn't send. Please try again." };
    }
  }

  /**
   * POST /api/chat and parse the SSE stream. JSON goes as text/plain so the
   * browser skips the CORS preflight (one fewer round trip per message).
   */
  async chat(body: Record<string, unknown>, h: ChatHandlers, signal: AbortSignal): Promise<void> {
    const res = await fetch(`${this.base}/api/chat`, {
      method: "POST",
      // default credentials (same-origin): the admin playground sends its session; client sites send nothing
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ key: this.key, testToken: this.testToken, ...body }),
      signal,
    });
    if (!res.ok || !res.body) {
      let message = "Couldn't send.";
      try {
        message = (await res.json()).error?.message ?? message;
      } catch {}
      const retryAfterMs = retryAfterToMs(res.headers.get("retry-after"));
      throw Object.assign(new Error(message), { status: res.status, retryAfterMs });
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "message";
        let data = "";
        for (const line of chunk.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (!data) continue;
        try {
          h.onEvent(event, JSON.parse(data));
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}

/** Shown once in the console when a page is not on the allow-list. */
export function widgetDisabledWarning(reason: string, origin: string): string | null {
  if (reason !== "origin") return null;
  const where = origin || "this page";
  let host = "";
  try {
    host = origin ? new URL(origin).hostname : "";
  } catch {
    /* keep generic wording */
  }
  const isIp = /^\d{1,3}(?:\.\d{1,3}){3}$|^\[.*\]$/.test(host);
  const add = host ? (isIp ? `Add ${host} (or open the page on localhost)` : `Add ${host}`) : "Add it";
  return `[Botly] This ${isIp ? "address" : "domain"} isn't allowed (${where}). ${add} in Botly → Settings → Allowed domains.`;
}

const hinted = new Set<string>();

/** One console.warn per page for each distinct message key. Never throws into the host page. */
export function warnOnce(k: string, message: string) {
  if (hinted.has(k)) return;
  hinted.add(k);
  try {
    console.warn(message);
  } catch {
    /* console can be missing in a locked-down page */
  }
}

/**
 * Why the widget isn't showing, once per page for each reason and origin. The config route
 * sends the reason on every site, so the site owner can see it in the browser console.
 */
export function devHint(reason: string, origin: string) {
  const why: Record<string, string> = {
    unknown_key: "The data-key doesn't match any bot. Copy the install code from the bot's Overview page.",
    inactive: "The bot is switched off (Settings → Active).",
    not_live: "The bot is a draft. Drafts only work on localhost pages or the private test link; go live from the bot's Overview page.",
    bad_token: "The private test link is out of date. Open it again from the dashboard.",
  };
  warnOnce(`${reason}|${origin}`, widgetDisabledWarning(reason, origin) ?? `[Botly] Chat widget not shown: ${why[reason] ?? reason}`);
}

/** How long the widget waits for a reply before giving up. Longer than /api/chat's maxDuration (60 s). */
export const CLIENT_REPLY_TIMEOUT_MS = 65_000;

/** Retry-After as seconds or an HTTP date, capped at 60 s (null when absent or invalid). */
export function retryAfterToMs(v: string | null, now = Date.now()): number | null {
  if (!v) return null;
  const secs = Number(v.trim());
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(v) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 60_000) : null;
}

/**
 * The line under a message that didn't send. HTTP 429 (an edge, firewall or app rate
 * limit) gets a calm "busy" line instead of "something went wrong".
 */
export function sendFailureText(f: { status?: number; offline?: boolean }): string {
  if (f.offline || !f.status) return "Not sent. Check your connection.";
  if (f.status === 429) return "Not sent. We're a little busy right now. Try again in a moment.";
  return "Not sent. Something went wrong on our side.";
}

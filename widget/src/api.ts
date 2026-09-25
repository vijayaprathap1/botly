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
    const res = await fetch(`${this.base}/api/widget/config?${this.q()}`, { credentials: "omit" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && !data.enabled && data.reason) devHint(data.reason, data.origin);
    return data && data.enabled ? (data as WidgetConfig) : null;
  }

  async history(visitorId: string, conversationId: string) {
    const res = await fetch(`${this.base}/api/widget/history?${this.q({ visitorId, conversationId })}`, { credentials: "omit" });
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
      throw Object.assign(new Error(message), { status: res.status });
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

/** Only reached on localhost pages (the server sends a reason only to loopback origins). */
function devHint(reason: string, origin: string) {
  const why: Record<string, string> = {
    origin: `${origin} is not in this bot's allowed domains. Add it in Botly → Settings → Allowed domains.`,
    unknown_key: "The data-key doesn't match any bot. Copy the install snippet from the bot's Overview page.",
    inactive: "The bot is switched off (Settings → Active).",
    not_live: "The bot is a draft. Drafts only work on localhost pages or the private test link.",
  };
  try {
    console.warn(`[Botly] Chat widget not shown: ${why[reason] ?? reason}`);
  } catch {}
}

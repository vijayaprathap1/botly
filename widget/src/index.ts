/**
 * Botly embed. Install:
 *   <script src="https://APP_DOMAIN/widget.js" data-key="PUBLIC_KEY" async></script>
 * Works in <head> or <body>, with or without async/defer, and when injected later by
 * React, Next.js (next/script), Google Tag Manager or a WordPress plugin.
 * `data-bot-key` is accepted as an alias of `data-key`.
 * Optional: data-mode="fullscreen" (private test page), data-test-token="…" (test page only).
 */
import { warnOnce } from "./api";
import { findScript, keyOf } from "./locate";
import { BotlyWidget } from "./widget";

type Call = [string, unknown[]];
type BotlyApi = {
  open(): void;
  close(): void;
  sendMessage(text: string): void;
  identify(id: { name?: string; phone?: string; email?: string }): void;
  q?: Call[];
};

declare global {
  interface Window {
    Botly?: BotlyApi;
    __botlyLoaded?: boolean;
  }
}

(function boot() {
  // Included twice (theme + plugin, or re-run by a SPA): the first copy wins.
  if (window.__botlyLoaded || document.getElementById("botly-widget")) return;

  const script = findScript();
  const key = keyOf(script);
  if (!script || !key) {
    warnOnce("nokey", '[Botly] Chat widget not shown: the widget.js <script> tag has no data-key. Copy the install code from Botly → your bot → "Install on your website".');
    return;
  }
  window.__botlyLoaded = true;

  let base: string;
  try {
    base = new URL(script.src, location.href).origin;
  } catch {
    return;
  }
  const testToken = script.dataset.testToken?.trim() || null;
  const fullscreen = script.dataset.mode === "fullscreen";

  // Calls made before the widget is ready are queued and replayed.
  const queue: Call[] = window.Botly?.q ?? [];
  let widget: BotlyWidget | null = null;
  const call = (name: string, args: unknown[]) => {
    if (!widget) return void queue.push([name, args]);
    try {
      if (name === "open") widget.open();
      else if (name === "close") widget.close();
      else if (name === "sendMessage" && typeof args[0] === "string") void widget.send(args[0]);
      else if (name === "identify" && args[0] && typeof args[0] === "object") widget.identify(args[0] as never);
    } catch {
      /* never throw into the host page */
    }
  };
  window.Botly = {
    open: () => call("open", []),
    close: () => call("close", []),
    sendMessage: (text) => call("sendMessage", [text]),
    identify: (id) => call("identify", [id]),
  };

  const start = async () => {
    try {
      const w = new BotlyWidget({ base, key, testToken, fullscreen });
      if (!(await w.init())) return; // inactive or not allowed here: no launcher, no errors
      widget = w;
      for (const [n, a] of queue.splice(0)) call(n, a);
    } catch {
      /* stay silent on the client's site */
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  else void start();
})();

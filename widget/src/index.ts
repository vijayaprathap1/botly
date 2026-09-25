/**
 * Botly embed. Install:
 *   <script src="https://APP_DOMAIN/widget.js" data-key="PUBLIC_KEY" async></script>
 * Optional: data-mode="fullscreen" (private test page), data-test-token="…" (test page only).
 */
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
  if (window.__botlyLoaded) return; // script included twice
  window.__botlyLoaded = true;

  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-key][src*="widget.js"]');
  const key = script?.dataset.key?.trim();
  if (!script || !key) return;

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

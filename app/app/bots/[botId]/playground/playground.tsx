"use client";
import { useRef, useState } from "react";
import { CopyButton } from "@/components/client";
import { MarkdownLite } from "@/components/markdown";
import { Badge, btn, Card, inputClass } from "@/components/ui";

type Debug = {
  model: string;
  rounds: number;
  firstTokenMs: number | null;
  latencyMs: number;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  costUsd: number;
  cacheHit: boolean;
  toolCalls: { name: string; input: unknown; result: unknown }[];
  knowledge: { tokens: number; cap: number; included: number; excluded: number; titles: string[] };
  language: string;
  facts: string[];
};
type Msg = { role: "user" | "assistant" | "card" | "error"; text: string; debug?: Debug; card?: Record<string, unknown> };

const LANG_TESTS = [
  { label: "English", text: "Is cash on delivery available?" },
  { label: "Tamil", text: "கேஷ் ஆன் டெலிவரி இருக்கா? டெலிவரிக்கு எத்தனை நாள் ஆகும்?" },
  { label: "Hindi", text: "क्या कैश ऑन डिलीवरी उपलब्ध है? डिलीवरी में कितने दिन लगते हैं?" },
  { label: "Hinglish", text: "COD milega kya? Delivery mein kitne din lagenge?" },
];

const newVisitor = () => "play" + Math.random().toString(36).slice(2, 14);

export function Playground(props: { botKey: string; testToken: string; testUrl: string; snippet: string; greeting: string; isAdmin?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const conv = useRef<string | null>(null);
  const visitor = useRef(newVisitor());
  const listRef = useRef<HTMLDivElement>(null);

  const scroll = () => queueMicrotask(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setChips([]);
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    scroll();
    const assistantIndex = msgs.length + 1; // the assistant placeholder appended above
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ key: props.botKey, testToken: props.testToken, visitorId: visitor.current, conversationId: conv.current, message: text, pageUrl: location.href, pageTitle: "Botly playground", debug: true }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error?.message ?? `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1];
          const dataLine = /^data: (.+)$/m.exec(chunk)?.[1];
          if (!ev || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (ev === "meta") conv.current = data.conversationId;
          else if (ev === "delta") setMsgs((m) => m.map((x, j) => (j === assistantIndex ? { ...x, text: x.text + data.text } : x)));
          else if (ev === "tool_card") setMsgs((m) => [...m, { role: "card", text: data.type, card: data }]);
          else if (ev === "suggestions") setChips(data.questions ?? []);
          else if (ev === "debug") {
            setMsgs((m) => m.map((x, j) => (j === assistantIndex ? { ...x, debug: data } : x)));
            setSelected(assistantIndex);
          } else if (ev === "error") setMsgs((m) => [...m, { role: "error", text: `${data.code}: ${data.message}` }]);
          scroll();
        }
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: "error", text: e instanceof Error ? e.message : "Failed" }]);
    } finally {
      setBusy(false);
    }
  }

  const sel = selected != null ? msgs[selected]?.debug : undefined;
  const firstTokens = msgs.map((m) => m.debug?.firstTokenMs).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  const p50 = firstTokens.length ? firstTokens[Math.floor(firstTokens.length / 2)] : null;
  const totalCost = msgs.reduce((s, m) => s + (m.debug?.costUsd ?? 0), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card
        title="Chat"
        actions={
          <button
            className={btn.ghost}
            onClick={() => {
              setMsgs([]);
              setChips([]);
              setSelected(null);
              conv.current = null;
              visitor.current = newVisitor();
            }}
          >
            New conversation
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {LANG_TESTS.map((t) => (
            <button key={t.label} className={btn.secondary} disabled={busy} onClick={() => send(t.text)}>
              {t.label}
            </button>
          ))}
        </div>
        <div ref={listRef} className="h-[28rem] space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3" aria-live="polite">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-[15px] shadow-sm">{props.greeting}</div>
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-[15px] text-white">
                {m.text}
              </div>
            ) : m.role === "assistant" ? (
              <button key={i} onClick={() => setSelected(i)} className={`block max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-left text-[15px] shadow-sm ${selected === i ? "ring-2 ring-brand-600" : ""}`}>
                {m.text ? <MarkdownLite text={m.text} /> : <span className="text-slate-400">{busy ? "…" : "(no text)"}</span>}
                {m.debug ? (
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {m.debug.firstTokenMs ?? "—"} ms first token · {m.debug.latencyMs} ms total · ${m.debug.costUsd.toFixed(5)}
                  </span>
                ) : null}
              </button>
            ) : m.role === "card" ? (
              <div key={i} className="max-w-[85%] rounded-lg border border-dashed border-brand-600 bg-brand-50 px-3 py-2 text-xs text-brand-700">
                tool card: <b>{m.text}</b> {JSON.stringify(m.card)}
              </div>
            ) : (
              <div key={i} className="max-w-[85%] rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {m.text}
              </div>
            ),
          )}
        </div>
        {chips.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c} onClick={() => send(c)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm hover:border-brand-600">
                {c}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = input;
            setInput("");
            void send(t);
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} placeholder="Ask anything a customer would…" className={inputClass} aria-label="Message" />
          <button className={btn.primary} disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </Card>

      <div className="grid content-start gap-4">
        <Card title="Share">
          <div className="flex flex-wrap gap-2">
            <CopyButton text={props.testUrl} label="Copy private test link" />
            <CopyButton text={props.snippet} label="Copy install snippet" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Session: p50 first token <b>{p50 != null ? `${p50} ms` : "—"}</b> over {firstTokens.length} replies · total ${totalCost.toFixed(4)}
          </p>
        </Card>
        {props.isAdmin === false ? (
          <Card title="Tips">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>Ask what your customers ask. If an answer is wrong or missing, fix it in <b>Knowledge</b>. Changes apply to the next message.</li>
              <li>Questions it can&apos;t answer appear in <b>Unanswered</b>, where you can answer them once.</li>
              <li>Preview replies count toward your free-trial replies.</li>
            </ul>
          </Card>
        ) : null}
        <Card title="Debug" className={props.isAdmin === false ? "hidden" : undefined}>
          {!sel ? (
            <p className="text-sm text-slate-600">Send a message, then click a reply to inspect it.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="blue">{sel.model}</Badge>
                <Badge>{sel.language}</Badge>
                <Badge tone={sel.cacheHit ? "green" : "gray"}>{sel.cacheHit ? "cache hit" : "no cache hit"}</Badge>
                <Badge>{sel.rounds} model call{sel.rounds === 1 ? "" : "s"}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                <dt className="text-slate-500">First token</dt>
                <dd>{sel.firstTokenMs ?? "—"} ms</dd>
                <dt className="text-slate-500">Total</dt>
                <dd>{sel.latencyMs} ms</dd>
                <dt className="text-slate-500">Input / output</dt>
                <dd>
                  {sel.usage.input} / {sel.usage.output}
                </dd>
                <dt className="text-slate-500">Cache read / write</dt>
                <dd>
                  {sel.usage.cacheRead} / {sel.usage.cacheWrite}
                </dd>
                <dt className="text-slate-500">Cost</dt>
                <dd>${sel.costUsd.toFixed(6)}</dd>
                <dt className="text-slate-500">Knowledge</dt>
                <dd>
                  {sel.knowledge.included} sources · ~{sel.knowledge.tokens} tokens{sel.knowledge.excluded ? ` · ${sel.knowledge.excluded} left out (cap)` : ""}
                </dd>
              </dl>
              {sel.toolCalls.length ? (
                <div>
                  <div className="mb-1 font-medium">Tool calls</div>
                  <pre className="max-h-56 overflow-auto rounded bg-slate-900 p-2 text-[12px] text-slate-100">{JSON.stringify(sel.toolCalls, null, 2)}</pre>
                </div>
              ) : null}
              {sel.facts.length ? (
                <div>
                  <div className="mb-1 font-medium">Conversation facts sent</div>
                  <ul className="list-disc pl-5 text-slate-700">{sel.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              ) : null}
              <details>
                <summary className="cursor-pointer font-medium">Knowledge in the prompt ({sel.knowledge.titles.length})</summary>
                <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-slate-700">{sel.knowledge.titles.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

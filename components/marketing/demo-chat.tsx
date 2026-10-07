"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The chat on the landing page. It plays a scripted example conversation (no model call,
 * so it costs nothing and never hits a rate limit) to show the four things the product
 * does: answer in the customer's language, answer from the shop's facts, admit when it
 * doesn't know, and capture a lead. It is labelled as an example on the page.
 */
type Line = { from: "user" | "bot"; text: string } | { from: "card"; text: string } | { from: "note"; text: string };
type Sample = { label: string; lines: Line[] };

const COLOR = "#9f1239";
const SAMPLES: Sample[] = [
  {
    label: "COD இருக்கா?",
    lines: [
      { from: "user", text: "பிளவுஸ் தைக்க எவ்வளவு? COD இருக்கா?" },
      { from: "bot", text: "பிளவுஸ் தைக்க ₹650, 5 வேலை நாட்கள் ஆகும். இந்தியா முழுவதும் COD உண்டு." },
    ],
  },
  {
    label: "Delivery kitne din?",
    lines: [
      { from: "user", text: "Delivery kitne din mein hogi? Shipping free hai kya?" },
      { from: "bot", text: "Tamil Nadu mein 2–4 din, baaki India mein 5–7 din lagte hain. ₹1,999 se upar ke order par shipping free hai." },
    ],
  },
  {
    label: "I need 25 sarees",
    lines: [
      { from: "user", text: "I need 25 sarees for a wedding" },
      { from: "bot", text: "Lovely! For bulk orders our team prepares a special quote. May I have your name and phone number?" },
      { from: "user", text: "Priya, 98765 43210" },
      { from: "card", text: "Sent to the team. They'll contact you soon, Priya." },
    ],
  },
  {
    label: "Do you ship to Dubai?",
    lines: [
      { from: "user", text: "Do you ship to Dubai?" },
      { from: "bot", text: "I don't have that information yet. Would you like me to connect you with the team?" },
      { from: "note", text: "Saved to the owner's Unanswered inbox, to answer once." },
    ],
  },
];
const GREETING: Line = { from: "bot", text: "Vanakkam! I'm Meera from Ananya Handlooms. Ask me about sarees, delivery, returns or blouse stitching." };

export function DemoChat() {
  const [lines, setLines] = useState<Line[]>([GREETING, ...SAMPLES[0]!.lines]);
  const [typing, setTyping] = useState(false);
  const [used, setUsed] = useState<Set<number>>(new Set([0]));
  const timers = useRef<number[]>([]);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [lines, typing]);

  function play(i: number) {
    if (typing) return;
    setUsed((u) => new Set(u).add(i));
    const script = SAMPLES[i]!.lines;
    let at = 0;
    setTyping(true);
    script.forEach((line, n) => {
      // The assistant "types" for a moment; the visitor's own messages appear at once.
      at += line.from === "user" ? (n === 0 ? 0 : 900) : 750;
      timers.current.push(
        window.setTimeout(() => {
          setLines((l) => [...l, line]);
          if (n === script.length - 1) setTyping(false);
        }, at),
      );
    });
  }

  const left = SAMPLES.map((s, i) => ({ s, i })).filter(({ i }) => !used.has(i));
  return (
    <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-[var(--shadow-raised)]">
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: COLOR }}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[13px] font-semibold">M</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13.5px] font-semibold">Meera · Ananya Handlooms</p>
          <p className="text-[11.5px] opacity-80">Replies instantly</p>
        </div>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide">Example</span>
      </div>
      <div ref={list} className="h-[300px] space-y-2.5 overflow-y-auto bg-white px-3.5 py-4 text-[13px] leading-relaxed" role="log" aria-live="polite" aria-label="Example conversation">
        {lines.map((l, i) =>
          l.from === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 text-white" style={{ background: COLOR }}>{l.text}</div>
          ) : l.from === "bot" ? (
            <div key={i} className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-2 text-zinc-800">{l.text}</div>
          ) : l.from === "card" ? (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
              <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span>
              {l.text}
            </div>
          ) : (
            <p key={i} className="px-1 text-[11.5px] text-zinc-500">{l.text}</p>
          ),
        )}
        {typing ? (
          <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-2.5" aria-label="Meera is typing">
            {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${d * 120}ms` }} />)}
          </div>
        ) : null}
      </div>
      <div className="border-t border-zinc-100 px-3 py-2.5">
        {left.length ? (
          <>
            <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Try a question:</p>
            <div className="flex flex-wrap gap-1.5">
              {left.map(({ s, i }) => (
                <button key={i} type="button" disabled={typing} onClick={() => play(i)} className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-700 transition hover:border-zinc-400 disabled:opacity-50">
                  {s.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-zinc-600">Yours answers from your own business details.</p>
            <button
              type="button"
              onClick={() => {
                setLines([GREETING]);
                setUsed(new Set());
              }}
              className="flex-none rounded-full border border-zinc-200 px-2.5 py-1 text-[12px] font-medium text-zinc-700 hover:border-zinc-400"
            >
              Replay
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

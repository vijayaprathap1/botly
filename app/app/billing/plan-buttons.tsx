"use client";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "@/components/ui";
import type { PaidPlan } from "@/lib/plans";
import type { BillingInterval } from "@/lib/types";
import { cancelPlan, startCheckout, startTopup, switchToFree } from "./actions";

type RzpResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type RzpOrderResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
export type CheckoutOption = { interval: BillingInterval; founding?: boolean; label: string };
declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void; on(ev: string, cb: (e: unknown) => void): void };
  }
}

export function PlanButtons({ orgId, plan, options, current, cancelling }: { orgId: string; plan: PaidPlan; options: CheckoutOption[]; current: boolean; cancelling: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  async function subscribe(o: CheckoutOption) {
    setBusy(true);
    setMsg(null);
    const r = await startCheckout(orgId, plan, o.interval, Boolean(o.founding));
    if (!r || r.error || !r.subscriptionId) {
      setMsg({ tone: "red", text: r?.error ?? "Couldn't start the payment." });
      setBusy(false);
      return;
    }
    if (!window.Razorpay) {
      setMsg({ tone: "red", text: "The payment window didn't load. Check your connection and try again." });
      setBusy(false);
      return;
    }
    const rzp = new window.Razorpay({
      key: r.keyId,
      subscription_id: r.subscriptionId,
      name: "Botly",
      description: `${r.plan} plan for ${r.name}`,
      prefill: { email: r.email ?? undefined },
      theme: { color: "#4f46e5" },
      handler: async (res: RzpResponse) => {
        const v = await fetch("/api/billing/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, ...res }) });
        const j = (await v.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; error?: string };
        setMsg(
          j.ok
            ? j.pending
              ? { tone: "green", text: "Payment authorised. Your plan switches on as soon as Razorpay confirms the charge, usually within a few minutes." }
              : { tone: "green", text: "Payment successful. Your plan is active." }
            : { tone: "red", text: j.error ?? "We couldn't confirm the payment yet. It will update within a few minutes." },
        );
        setBusy(false);
        router.refresh();
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.open();
  }

  return (
    <div>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      {current ? (
        cancelling ? (
          <p className="text-sm text-zinc-600">Cancelled; active until the end of this period.</p>
        ) : (
          <button
            className={btn.secondary}
            disabled={busy}
            onClick={async () => {
              if (!window.confirm("Cancel your plan? It stays active until the end of the paid month.")) return;
              setBusy(true);
              const r = await cancelPlan(orgId);
              setMsg(r.ok ? { tone: "green", text: "Cancelled. Your plan stays active until the end of this period." } : { tone: "red", text: r.error ?? "Couldn't cancel" });
              setBusy(false);
              router.refresh();
            }}
          >
            Cancel plan
          </button>
        )
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o, i) => (
            <button key={`${o.interval}${o.founding ? "-f" : ""}`} className={i === 0 ? btn.primary : btn.secondary} disabled={busy} onClick={() => subscribe(o)}>
              {busy ? "Opening payment…" : o.label}
            </button>
          ))}
        </div>
      )}
      {msg ? <p className={`mt-2 text-sm ${msg.tone === "red" ? "text-red-700" : "text-emerald-700"}`}>{msg.text}</p> : null}
    </div>
  );
}

/** One-off pack: more conversations this month, paid by a Razorpay order. */
export function TopupButton({ orgId, label }: { orgId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  async function buy() {
    setBusy(true);
    setMsg(null);
    const r = await startTopup(orgId);
    if (!r || r.error || !r.orderId) {
      setMsg({ tone: "red", text: r?.error ?? "Couldn't start the payment." });
      setBusy(false);
      return;
    }
    if (!window.Razorpay) {
      setMsg({ tone: "red", text: "The payment window didn't load. Check your connection and try again." });
      setBusy(false);
      return;
    }
    const rzp = new window.Razorpay({
      key: r.keyId,
      order_id: r.orderId,
      amount: r.amount,
      currency: "INR",
      name: "Botly",
      description: `${r.description} for ${r.name}`,
      prefill: { email: r.email ?? undefined },
      theme: { color: "#4f46e5" },
      handler: async (res: RzpOrderResponse) => {
        const v = await fetch("/api/billing/topup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId, ...res }) });
        const j = (await v.json().catch(() => ({}))) as { ok?: boolean; pending?: boolean; error?: string };
        setMsg(
          j.ok
            ? j.pending
              ? { tone: "green", text: "Payment received. The extra conversations appear as soon as Razorpay confirms it, usually within a few minutes." }
              : { tone: "green", text: "Done. The extra conversations are available now." }
            : { tone: "red", text: j.error ?? "We couldn't confirm the payment yet. It will update within a few minutes." },
        );
        setBusy(false);
        router.refresh();
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.open();
  }
  return (
    <div>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <button className={btn.secondary} disabled={busy} onClick={buy}>{busy ? "Opening payment…" : label}</button>
      {msg ? <p className={`mt-2 text-sm ${msg.tone === "red" ? "text-red-700" : "text-emerald-700"}`}>{msg.text}</p> : null}
    </div>
  );
}

/** Ended trial (or no subscription): keep the assistant answering on the Free plan. */
export function SwitchToFreeButton({ orgId, label }: { orgId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button
        className={btn.secondary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await switchToFree(orgId);
          if (r.error) setErr(r.error);
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? "Switching…" : label}
      </button>
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
    </div>
  );
}

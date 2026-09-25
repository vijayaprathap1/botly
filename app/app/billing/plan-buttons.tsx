"use client";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "@/components/ui";
import { cancelPlan, startCheckout } from "./actions";

type RzpResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open(): void; on(ev: string, cb: (e: unknown) => void): void };
  }
}

export function PlanButtons({ orgId, plan, current, cancelling }: { orgId: string; plan: "starter" | "growth"; current: boolean; cancelling: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  async function subscribe() {
    setBusy(true);
    setMsg(null);
    const r = await startCheckout(orgId, plan);
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
        const j = (await v.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        setMsg(j.ok ? { tone: "green", text: "Payment successful. Your plan is active." } : { tone: "red", text: j.error ?? "We couldn't confirm the payment yet. It will update within a few minutes." });
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
          <p className="text-sm text-slate-600">Cancelled; active until the end of this period.</p>
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
        <button className={btn.primary} disabled={busy} onClick={subscribe}>
          {busy ? "Opening payment…" : `Choose ${plan === "growth" ? "Growth" : "Starter"}`}
        </button>
      )}
      {msg ? <p className={`mt-2 text-sm ${msg.tone === "red" ? "text-red-700" : "text-emerald-700"}`}>{msg.text}</p> : null}
    </div>
  );
}

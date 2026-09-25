/** Static product illustration for the landing page: a store page with the chat open. */
export function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-[1040px]">
      <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[40px] bg-gradient-to-b from-brand-100/60 via-brand-50/30 to-transparent blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-300" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <div className="mx-auto flex h-6 w-72 max-w-[60%] items-center justify-center rounded-md bg-white text-[11px] text-zinc-400 ring-1 ring-zinc-200">yourstore.in/products/silk-saree</div>
        </div>
        <div className="relative grid min-h-[420px] grid-cols-1 gap-6 p-6 sm:p-8 md:grid-cols-[0.85fr_1fr_1.1fr]">
          <div className="hidden md:block" aria-hidden>
            <div className="aspect-[4/5] rounded-xl bg-[radial-gradient(circle_at_30%_20%,#fecdd3,transparent_55%),radial-gradient(circle_at_80%_80%,#fde68a,transparent_50%),linear-gradient(135deg,#9f1239,#be123c_45%,#f59e0b)] opacity-90" />
            <div className="mt-3 grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-square rounded-md bg-rose-100" />)}</div>
          </div>
          <div className="hidden text-left md:block" aria-hidden>
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Kanchipuram silk</p>
            <p className="mt-1 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-zinc-900">Temple Border Saree, Maroon</p>
            <p className="mt-2 text-[18px] font-semibold text-zinc-900">₹12,500</p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-500">Pure mulberry silk with zari temple border. 6.3 m including blouse piece. In stock.</p>
            <div className="mt-4 flex gap-2">{["COD available", "Free returns · 7 days"].map((t) => <span key={t} className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">{t}</span>)}</div>
            <div className="mt-6 flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 text-[13px] font-medium text-white">Add to cart</div>
          </div>
          <div className="relative flex items-end justify-center md:justify-end" aria-label="Example chat: a customer asks in Tamil and gets an answer in Tamil">
            <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[var(--shadow-raised)]">
              <div className="flex items-center gap-3 bg-[#9f1239] px-4 py-3 text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[13px] font-semibold">M</span>
                <div className="leading-tight"><p className="text-[13.5px] font-semibold">Meera · Ananya Handlooms</p><p className="text-[11.5px] opacity-80">Replies instantly</p></div>
              </div>
              <div className="space-y-2.5 bg-white px-3.5 py-4 text-[13px] leading-relaxed">
                <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-[#9f1239] px-3 py-2 text-white">பிளவுஸ் தைக்க எவ்வளவு? COD இருக்கா?</div>
                <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-2 text-zinc-800">பிளவுஸ் தைக்க <b>₹650</b>, 5 வேலை நாட்கள் ஆகும். இந்தியா முழுவதும் <b>COD</b> உண்டு.</div>
                <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-[#9f1239] px-3 py-2 text-white">I need 25 sarees for a wedding</div>
                <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3 py-2 text-zinc-800">Lovely! For bulk orders our team prepares a special quote. May I have your name and phone number?</div>
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span> Sent to the team on WhatsApp
                </div>
              </div>
              <div className="flex gap-2 border-t border-zinc-100 px-3 py-2.5">
                <div className="h-8 flex-1 rounded-lg border border-zinc-200 bg-zinc-50" />
                <div className="h-8 w-8 rounded-full bg-[#9f1239]/80" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

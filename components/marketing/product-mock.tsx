import { DemoChat } from "./demo-chat";

/** Product illustration for the landing page: an example store page with a playable example chat. */
export function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-[1040px]">
      <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[40px] bg-gradient-to-b from-brand-100/60 via-brand-50/30 to-transparent blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-300" /><span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          <div className="mx-auto flex h-6 w-80 max-w-[70%] truncate px-2 items-center justify-center rounded-md bg-white text-[11px] text-zinc-400 ring-1 ring-zinc-200">Example store · yourstore.in/products/silk-saree</div>
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
          <div className="relative flex items-end justify-center md:justify-end">
            <DemoChat />
          </div>
        </div>
      </div>
    </div>
  );
}

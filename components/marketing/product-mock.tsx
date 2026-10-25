import { DemoChat } from "./demo-chat";

/** Product illustration for the landing page: an example store page with a playable example chat. */
export function ProductMock() {
  return (
    <div className="relative mx-auto w-full max-w-[1040px]">
      <div className="absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[40px] bg-gradient-to-b from-brand-100/60 via-brand-50/30 to-transparent blur-2xl" aria-hidden />
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300" />
          <div className="mx-auto flex h-6 min-w-0 max-w-full items-center justify-center truncate rounded-md bg-white px-3 text-[11px] text-zinc-400 ring-1 ring-zinc-200">yourstore.in</div>
        </div>
        <div className="flex items-center justify-center p-4 sm:p-8">
          <DemoChat />
        </div>
      </div>
    </div>
  );
}

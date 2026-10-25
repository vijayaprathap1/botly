"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Wordmark } from "./icons";
import { HOME_LINKS, btnLg, btnOutline, btnPrimary, btnSm } from "./ui";

/** Sticky homepage nav. At ≤900px the links move into a full-screen menu (Esc closes it, focus returns to the button). */
export function HomeNav() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
      // Keep Tab inside the button + menu while it is open.
      if (e.key === "Tab" && menu.current && button.current) {
        const items = [button.current, ...menu.current.querySelectorAll<HTMLElement>("a")];
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onHash = () => close();
    const mq = window.matchMedia("(min-width: 901px)");
    const onWide = () => mq.matches && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    mq.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
      mq.removeEventListener("change", onWide);
    };
  }, [open, close]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-cream/94 backdrop-blur-[10px]">
        <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center gap-3 px-5 wsm:h-[72px] wsm:gap-6 wsm:px-8">
          <Link href="/" aria-label="Botly home" className="inline-flex min-h-11 items-center rounded-xl">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="ml-auto hidden gap-1.5 wmd:flex">
            {HOME_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="inline-flex min-h-11 items-center rounded-full px-3.5 text-[15px] font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 wmd:ml-0">
            <Link href="/login" className="hidden min-h-11 items-center rounded-full px-3 text-[15px] font-semibold text-ink-2 hover:text-ink wmd:inline-flex">
              Sign in
            </Link>
            <Link href="/login?signup=1" className={`${btnSm} ${btnPrimary} px-4 wsm:px-[18px]`}>
              Start free
            </Link>
            <button
              ref={button}
              type="button"
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink text-ink wmd:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mmenu"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
          </div>
        </div>
      </header>
      <div
        id="mmenu"
        ref={menu}
        hidden={!open}
        className="fixed inset-x-0 bottom-0 top-[68px] z-[49] overflow-auto bg-cream px-6 pb-8 pt-4 wsm:top-[72px] wmd:hidden"
      >
        <nav aria-label="Menu">
          {HOME_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => close()} className="flex min-h-14 items-center border-b-[1.5px] border-line font-display text-[24px] font-bold">
              {l.label}
            </a>
          ))}
        </nav>
        <Link href="/login?signup=1" onClick={() => close()} className={`${btnLg} ${btnPrimary} mt-4 w-full`}>
          Build my assistant free <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
        <Link href="/login" onClick={() => close()} className={`${btnLg} ${btnOutline} mt-4 w-full`}>
          Sign in
        </Link>
      </div>
    </>
  );
}

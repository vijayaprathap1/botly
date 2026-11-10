"use client";

import { usePathname } from "next/navigation";

/**
 * Botly's own assistant on botly.in pages, included once from the root layout.
 * Not on /t/… test links: they load the customer's bot with its own widget.js tag, and
 * widget.js boots only the first copy that runs, so Botly's bot could replace theirs.
 */
export function SiteWidget() {
  const path = usePathname() ?? "";
  if (path.startsWith("/t/")) return null;
  return <script src="https://botly.in/widget.js" data-key="pk_d613ae9530884c74b420b42c" async />;
}

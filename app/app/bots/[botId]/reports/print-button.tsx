"use client";
import { btn } from "@/components/ui";

export function PrintButton() {
  return <button type="button" className={btn.primary} onClick={() => window.print()}>Print</button>;
}

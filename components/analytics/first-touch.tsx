"use client";

import { useEffect } from "react";
import { FIRST_TOUCH_KEY, firstTouchFrom, parseStoredFirstTouch, type FirstTouch } from "@/lib/analytics/attribution";

/**
 * Remember the first campaign, referrer and landing path in localStorage.
 * Later calls return the stored value. Nothing is written to document.cookie.
 */
export function captureFirstTouch(): FirstTouch {
  const fresh = firstTouchFrom({
    search: window.location.search,
    referrer: document.referrer,
    path: window.location.pathname + window.location.search,
  });
  try {
    const existing = parseStoredFirstTouch(localStorage.getItem(FIRST_TOUCH_KEY));
    if (existing) return existing;
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(fresh));
  } catch {
    /* private mode or a full disk: the signup still records a direct visit */
  }
  return fresh;
}

/** Writes the stored first touch onto hidden inputs before the signup form submits. */
export function stampFirstTouch(form: HTMLFormElement): void {
  const touch = captureFirstTouch();
  for (const [name, value] of Object.entries(touch)) {
    const found = form.elements.namedItem(name);
    const input = found instanceof HTMLInputElement ? found : null;
    const field = input ?? document.createElement("input");
    if (!input) {
      field.type = "hidden";
      field.name = name;
      form.appendChild(field);
    }
    field.value = value;
  }
}

export function FirstTouchCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);
  return null;
}

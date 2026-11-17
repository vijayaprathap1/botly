/**
 * Voice input with the browser's own Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * Botly never receives audio: the browser turns speech into text and the widget only puts that
 * text in the message box. Nothing is sent until the visitor taps Send.
 * Supported in Chrome/Edge (desktop + Android) and Safari (macOS, iOS 14.5+). Firefox has no
 * SpeechRecognition, so the mic button is not shown there.
 */
import { indicLang } from "./fonts";

export type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type Ctor = new () => SpeechRec;
type Policy = { allowsFeature(feature: string): boolean };

/** The recogniser constructor, or null when this browser (or an insecure page) can't do it. */
export function speechCtor(w: Record<string, unknown> = window as unknown as Record<string, unknown>): Ctor | null {
  if (w.isSecureContext === false) return null;
  // The host page's Permissions-Policy can switch the microphone off (e.g. `microphone=()`).
  // Then the mic would always fail with "blocked", so hide the button instead.
  const doc = w.document as { permissionsPolicy?: Policy; featurePolicy?: Policy } | undefined;
  const policy = doc?.permissionsPolicy || doc?.featurePolicy;
  if (policy && typeof policy.allowsFeature === "function") {
    try {
      if (!policy.allowsFeature("microphone")) return null;
    } catch {
      /* unknown feature name: assume allowed */
    }
  }
  const c = (w.SpeechRecognition || w.webkitSpeechRecognition) as Ctor | undefined;
  return typeof c === "function" ? c : null;
}

/**
 * Recognition language. The visitor's own last message decides first (Tamil or Devanagari
 * script → ta-IN / hi-IN), then the page's <html lang>, then the greeting's script. Latin
 * text (English, Hinglish, Tanglish) uses en-IN, which handles Indian English accents.
 */
export function pickSpeechLang(o: { lastUserText?: string | null; pageLang?: string | null; greeting?: string | null }): string {
  const byText = indicLang(o.lastUserText ?? "");
  if (byText) return byText === "ta" ? "ta-IN" : "hi-IN";
  const page = (o.pageLang ?? "").toLowerCase();
  if (page.startsWith("ta")) return "ta-IN";
  if (page.startsWith("hi")) return "hi-IN";
  const byGreeting = indicLang(o.greeting ?? "");
  if (byGreeting) return byGreeting === "ta" ? "ta-IN" : "hi-IN";
  return "en-IN";
}

/** Everything heard so far in this session, final and interim, as one line. */
export function transcriptOf(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  let out = "";
  for (let i = 0; i < results.length; i++) out += results[i]?.[0]?.transcript ?? "";
  return out.replace(/\s+/g, " ").trim();
}

/** A short, calm line for each recogniser error. null = say nothing (the visitor stopped it). */
export function voiceErrorText(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone is blocked. Allow it in your browser settings to use voice.";
    case "no-speech":
      return "Didn't catch that. Tap the mic and try again.";
    case "audio-capture":
      return "No microphone found on this device.";
    case "network":
      return "Voice needs an internet connection. You can type instead.";
    case "language-not-supported":
      return "Voice isn't available for this language here. You can type instead.";
    default:
      return "Voice input stopped. You can type instead.";
  }
}

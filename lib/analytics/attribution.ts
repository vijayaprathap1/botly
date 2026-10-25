/** First-touch campaign fields stored in localStorage and on the organization. No cookies. */
export const FIRST_TOUCH_KEY = "botly_ft";

export type FirstTouch = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  referrer: string;
  landing_path: string;
};

const FIELD_MAX = 200;
const URL_MAX = 500;

function stripControls(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function clip(value: string, max: number): string {
  return stripControls(value).slice(0, max);
}

/** http(s) referrer only, so a crafted value can't land in the database as a script URL. */
export function cleanReferrer(value: string | null | undefined): string {
  const raw = clip(value ?? "", URL_MAX);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().slice(0, URL_MAX);
  } catch {
    return "";
  }
}

/** Path on our site (`/start?utm_source=…`), never an off-site URL. */
export function cleanLandingPath(value: string | null | undefined): string {
  const raw = clip(value ?? "", URL_MAX);
  if (!raw) return "/";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "/";
    return (url.pathname + url.search).slice(0, URL_MAX) || "/";
  } catch {
    return "/";
  }
}

function field(value: string | null | undefined): string {
  return clip(value ?? "", FIELD_MAX);
}

/**
 * First page view. Missing utm_source becomes `direct` (the spec default).
 * Later visits must not call this again; the stored value wins.
 */
export function firstTouchFrom(input: { search?: string | null; referrer?: string | null; path?: string | null }): FirstTouch {
  const search = input.search ?? "";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const source = field(params.get("utm_source"));
  return {
    utm_source: source || "direct",
    utm_medium: field(params.get("utm_medium")),
    utm_campaign: field(params.get("utm_campaign")),
    utm_content: field(params.get("utm_content")),
    utm_term: field(params.get("utm_term")),
    referrer: cleanReferrer(input.referrer),
    landing_path: cleanLandingPath(input.path),
  };
}

export function directFirstTouch(): FirstTouch {
  return firstTouchFrom({ search: "", referrer: "", path: "/" });
}

/** Reads a localStorage payload. Corrupt JSON is treated as missing so the next visit can store a real one. */
export function parseStoredFirstTouch(raw: string | null | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof FirstTouch, unknown>>;
    if (!parsed || typeof parsed !== "object") return null;
    const asString = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      utm_source: field(asString(parsed.utm_source)) || "direct",
      utm_medium: field(asString(parsed.utm_medium)),
      utm_campaign: field(asString(parsed.utm_campaign)),
      utm_content: field(asString(parsed.utm_content)),
      utm_term: field(asString(parsed.utm_term)),
      referrer: cleanReferrer(asString(parsed.referrer)),
      landing_path: cleanLandingPath(asString(parsed.landing_path)),
    };
  } catch {
    return null;
  }
}

/** Form fields posted with signup. Unknown or hostile values collapse to a direct visit. */
export function attributionFromFields(fields: { get(name: string): unknown }): FirstTouch {
  const text = (name: string) => {
    const v = fields.get(name);
    return typeof v === "string" ? v : "";
  };
  return {
    utm_source: field(text("utm_source")) || "direct",
    utm_medium: field(text("utm_medium")),
    utm_campaign: field(text("utm_campaign")),
    utm_content: field(text("utm_content")),
    utm_term: field(text("utm_term")),
    referrer: cleanReferrer(text("referrer")),
    landing_path: cleanLandingPath(text("landing_path")),
  };
}

/** Columns written onto organizations. Empty optional fields stay null so they don't look like a campaign. */
export function attributionColumns(touch: FirstTouch): {
  utm_source: string;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_path: string | null;
} {
  const empty = (v: string) => v || null;
  return {
    utm_source: touch.utm_source || "direct",
    utm_medium: empty(touch.utm_medium),
    utm_campaign: empty(touch.utm_campaign),
    utm_content: empty(touch.utm_content),
    utm_term: empty(touch.utm_term),
    referrer: empty(touch.referrer),
    landing_path: empty(touch.landing_path),
  };
}

/** sign_up properties: method plus the same first-touch fields, omitting blanks. */
export function signUpProperties(method: "google" | "email", touch: FirstTouch): Record<string, string> {
  const cols = attributionColumns(touch);
  const out: Record<string, string> = { method, utm_source: cols.utm_source };
  for (const key of ["utm_medium", "utm_campaign", "utm_content", "utm_term", "referrer", "landing_path"] as const) {
    const value = cols[key];
    if (value) out[key] = value;
  }
  return out;
}

/** Google OAuth versus the magic-link email path. Any other provider counts as email. */
export function signupMethod(user: { app_metadata?: { provider?: string } } | null | undefined): "google" | "email" {
  return user?.app_metadata?.provider === "google" ? "google" : "email";
}

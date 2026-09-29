import { ImageResponse } from "next/og";

export const alt = "Botly: customer support that knows your business, in your customers' language";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card shown when a Botly link is shared on WhatsApp, LinkedIn or X. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0b0b12 0%, #1e1b4b 100%)", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#4f46e5" />
            <path d="M9 10.5A3.5 3.5 0 0 1 12.5 7h7A3.5 3.5 0 0 1 23 10.5v6a3.5 3.5 0 0 1-3.5 3.5H15l-4.6 3.9c-.5.4-1.4.1-1.4-.6V10.5Z" fill="#fff" />
            <circle cx="13" cy="13.5" r="1.5" fill="#4f46e5" />
            <circle cx="19" cy="13.5" r="1.5" fill="#4f46e5" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Botly</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>Customer support that knows your business</div>
          <div style={{ fontSize: 32, color: "#c7d2fe" }}>Answers in English, Tamil and Hindi. Sends you the leads.</div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 24, color: "#a5b4fc" }}>
          <div style={{ display: "flex", padding: "8px 16px", borderRadius: 999, border: "1px solid #4338ca" }}>Free 14-day trial</div>
          <div style={{ display: "flex", padding: "8px 16px", borderRadius: 999, border: "1px solid #4338ca" }}>One line to install</div>
        </div>
      </div>
    ),
    size,
  );
}

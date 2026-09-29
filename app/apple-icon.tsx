import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#4f46e5", borderRadius: 40 }}>
        <svg width="120" height="120" viewBox="0 0 32 32">
          <path d="M9 10.5A3.5 3.5 0 0 1 12.5 7h7A3.5 3.5 0 0 1 23 10.5v6a3.5 3.5 0 0 1-3.5 3.5H15l-4.6 3.9c-.5.4-1.4.1-1.4-.6V10.5Z" fill="#fff" />
          <circle cx="13" cy="13.5" r="1.5" fill="#4f46e5" />
          <circle cx="19" cy="13.5" r="1.5" fill="#4f46e5" />
        </svg>
      </div>
    ),
    size,
  );
}

import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { CloudflareWebAnalytics } from "@/components/analytics/cloudflare-beacon";
import { FirstTouchCapture } from "@/components/analytics/first-touch";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Botly", template: "%s · Botly" },
  description: "AI support assistant for your website",
  robots: { index: false, follow: false },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <FirstTouchCapture />
        <CloudflareWebAnalytics />
      </body>
    </html>
  );
}

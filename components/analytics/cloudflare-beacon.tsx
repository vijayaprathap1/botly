import Script from "next/script";
import { cloudflareBeaconToken } from "@/lib/analytics/beacon";

/**
 * Cookieless Cloudflare Web Analytics. Rendered from the root layout, so it
 * loads on marketing and app pages only. The embeddable widget is a separate
 * bundle (widget/src) and never imports this.
 * No token, or a token that isn't a plain id → nothing is rendered.
 */
export function CloudflareWebAnalytics() {
  const token = cloudflareBeaconToken();
  if (!token) return null;
  return (
    <Script
      id="botly-cf-beacon"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}

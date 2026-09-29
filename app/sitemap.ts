import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

/** Public marketing and legal pages only (the dashboard and test links are private). */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = config.appUrl;
  const pages: [string, number][] = [["/", 1], ["/login?signup=1", 0.8], ["/contact", 0.5], ["/terms", 0.3], ["/privacy-policy", 0.3], ["/refund-policy", 0.3]];
  return pages.map(([path, priority]) => ({ url: `${base}${path}`, changeFrequency: "monthly", priority }));
}

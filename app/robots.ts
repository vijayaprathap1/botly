import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/t/", "/start", "/setup", "/auth"] }],
    sitemap: `${config.appUrl}/sitemap.xml`,
  };
}

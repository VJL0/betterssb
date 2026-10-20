import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

/** The public pages. The rest show a student's own saved data and aren't indexed. */
const PUBLIC_PATHS = ["/", "/start", "/search"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: new URL(path, SITE_URL).href }));
}

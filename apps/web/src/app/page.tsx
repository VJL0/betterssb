import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/landing-page";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Search engines read this as a free web app (https://schema.org/WebApplication). */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Escaped so the JSON can't close the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c"),
        }}
      />
      <LandingPage />
    </>
  );
}

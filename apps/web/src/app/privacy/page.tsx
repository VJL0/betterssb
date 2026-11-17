import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@workspace/ui/components/logo";
import { SOURCE_CODE_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Privacy policy",
  alternates: { canonical: "/privacy" },
};

/** Change with every edit below; the extension's store listing links here. */
const LAST_UPDATED = "November 17, 2026";

const CONTACT_URL = `${SOURCE_CODE_URL}/issues`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * The privacy policy for the website and the Chrome extension. The Chrome Web
 * Store's privacy tab links here, so it must match what the extension's popup
 * discloses and what both actually do.
 */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background text-sm text-foreground">
      <header className="mx-auto flex min-h-18 max-w-3xl items-center px-4 sm:px-8">
        <Link
          href="/"
          className="rounded-2xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Logo />
        </Link>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pt-6 pb-16 leading-relaxed sm:px-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Privacy policy
          </h1>
          <p className="text-muted-foreground">Last updated {LAST_UPDATED}</p>
          <p className="text-muted-foreground">
            BetterSSB is an independent student project for Temple University
            students, not affiliated with Temple University or Ellucian. This
            policy covers the BetterSSB website and the BetterSSB Chrome
            extension.
          </p>
        </div>

        <Section title="The Chrome extension">
          <p className="text-muted-foreground">
            The extension asks for your agreement in its popup before it uses
            any of the data below. Until you agree, it makes no requests.
          </p>
          <List
            items={[
              "Your Temple sign-ins: it sends requests to Temple's Banner, DARS and TUportal with the sign-ins already in your browser, to check that you're signed in, read your registration terms, plans, registration time and degree audit, check CRNs and submit the registration you set up. These requests go straight from your browser to Temple. BetterSSB never sees your password or your Temple cookies.",
              "Banner class pages: it reads the class search results on Banner's pages to show ratings, seats and plan tags next to them. It sends instructor names from those pages to the BetterSSB server to look up their Rate My Professors ratings.",
              "Stored in your browser: your plans, settings, auto-register queue and its last result, whether you're signed in to Banner, and a log of the requests it sent (method, address without session IDs, status and time; the last 500). This stays in Chrome's extension storage on your device.",
              "The BetterSSB website: when it's open, the extension shares your stored plans and settings with it, and passes it Banner terms and plans and the degree audits you run, so the website can show them.",
            ]}
          />
          <p className="text-muted-foreground">
            It doesn't read any other site, and doesn't collect your browsing
            history.
          </p>
        </Section>

        <Section title="The website">
          <List
            items={[
              "Saved in your browser: plans, settings, your audit and transcript and advisor chats stay in this browser (or in the extension, once it's installed). Export or delete them from Settings.",
              "Audits and transcripts: when you upload one or run an audit, our server reads it to show your progress and doesn't keep it.",
              "Advisor: your messages and the plan, audit or transcript you choose to share are sent to Google's Gemini API to write the reply.",
              "Seat tracker sign-in: signing in with Google stores your Google email, name, profile picture link and account ID, the classes you watch, and for each signed-in browser its user agent and IP address. We email you at your Google address when a seat opens.",
              "Error reports: in production, Sentry receives errors and performance data without request bodies, prompts or uploaded files. Session replays are recorded only when an error happens or you send feedback, with text and images masked.",
            ]}
          />
        </Section>

        <Section title="How we use and share data">
          <List
            items={[
              "Only to provide the features above. We don't sell data, show ads, or use it for advertising, credit or lending decisions.",
              "It's shared only with the services that run those features: Google (sign-in, Gemini, email), Sentry (error reports) and our hosting providers (Vercel, Neon and Redis), or when the law requires it.",
              "People don't read your data, except error reports when fixing a problem, or when the law requires it.",
              "The use of information received from Google APIs and through the extension adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.",
            ]}
          />
        </Section>

        <Section title="Security and retention">
          <List
            items={[
              "Everything travels over HTTPS. Sign-in sessions are stored only as hashes.",
              "Data in your browser stays until you delete it in Settings or remove the extension.",
              "Seat watches stay until you remove them. Sign-in sessions expire on their own.",
            ]}
          />
        </Section>

        <Section title="Contact and changes">
          <p className="text-muted-foreground">
            To ask a question or have your account deleted, open an issue on{" "}
            <a
              href={CONTACT_URL}
              className="text-foreground underline underline-offset-4"
            >
              GitHub
            </a>
            . When this policy changes, the date above changes; if the extension
            starts using data in a new way, it asks for your agreement again
            first.
          </p>
        </Section>
      </main>
    </div>
  );
}

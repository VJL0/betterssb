import { Button } from "@workspace/ui/components/button";
import { Card } from "@workspace/ui/components/card";
import { giveDataConsent } from "@/lib/data-consent";
import { openWeb } from "./lib/open-web";

/** Every kind of user data the extension handles; keep it in step with the website's privacy policy. */
const DATA_USES = [
  [
    "Your Temple sign-ins",
    "Banner, DARS and TUportal requests use the sign-ins already in this browser to check seats, run your audit and register you. BetterSSB never sees your password.",
  ],
  [
    "Instructor names",
    "Names on Banner's class pages go to the BetterSSB server to look up ratings.",
  ],
  [
    "Your plan and audit",
    "Plans, the auto-register queue and the request log stay in this browser. An audit you run goes to the BetterSSB website, whose server reads it and doesn't keep it.",
  ],
] as const;

/**
 * The prominent disclosure the Chrome Web Store's User Data Policy asks for:
 * shown before anything else, and nothing that uses the data runs until the
 * student agrees.
 */
export function DataConsent() {
  return (
    <div className="flex flex-col gap-3">
      <Card
        render={<section aria-labelledby="consent-heading" />}
        className="gap-3 rounded-2xl p-4"
      >
        <h1 id="consent-heading" className="text-base font-semibold">
          Before you start
        </h1>
        <p className="text-muted-foreground">
          BetterSSB needs your OK to use this data. Nothing runs until you
          agree.
        </p>
        <dl className="flex flex-col gap-3">
          {DATA_USES.map(([term, detail]) => (
            <div key={term} className="flex flex-col gap-0.5">
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Button className="w-full" onClick={() => void giveDataConsent()}>
        Agree
      </Button>
      <Button
        variant="link"
        className="self-center"
        onClick={() => void openWeb("/privacy")}
      >
        Privacy policy
      </Button>
    </div>
  );
}

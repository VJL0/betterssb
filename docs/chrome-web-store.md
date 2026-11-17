# Chrome Web Store submission

What to paste into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) for the BetterSSB extension. Keep it in step with the extension, its popup's data disclosure (`apps/extension/entrypoints/popup/data-consent.tsx`) and the website's privacy policy (`apps/web/src/app/privacy/page.tsx`): the store treats any mismatch between them as a violation.

## Package

`apps/extension/.env.production` (ignored by git) sets both origins:

```
WXT_API_ORIGIN=https://betterssb.vercel.app
WXT_WEB_ORIGIN=https://betterssb.vercel.app
```

Then `pnpm --filter extension zip` writes `apps/extension/.output/extension-<version>-chrome.zip`; it refuses to run without `https://` origins. Bump `version` in `apps/extension/package.json` before each new upload.

## Store listing

**Category:** Education, or Workflow & Planning if Education isn't offered.

**Language:** English

**Detailed description:**

```
BetterSSB adds instructor ratings and your class plan to Temple University's Self-Service Banner, and registers your queued classes the moment your registration window opens.

On Banner's class search (Browse Classes, Plan Ahead, Find Classes):
• A Rate My Professors rating before each instructor
• "In your plan" and "Conflicts with your plan" tags

With the BetterSSB website (betterssb.vercel.app):
• Auto-register: queue CRNs, pick your registration time and arm it. The extension submits them through Banner with your own sign-in, once, at that time, and notifies you of the result.
• Run your DARS degree audit and see each requirement's progress
• Bring in the plans you made in Banner

In the popup: whether you're signed in to Banner, when auto-register will run, and every request the extension has sent.

Your data: the extension asks before using any of it. Requests to Banner, DARS and TUportal go straight from your browser to Temple with your existing sign-in; BetterSSB never sees your password. Only instructor names go to the BetterSSB server, to look up ratings. Privacy policy: https://betterssb.vercel.app/privacy

BetterSSB is an independent student project. It is not affiliated with, endorsed by or sponsored by Temple University or Ellucian.
```

**Homepage URL:** https://betterssb.vercel.app

**Support URL:** https://github.com/VJL0/betterssb/issues

**Graphic assets:** the 128×128 icon comes from the package. At least one screenshot is required (1280×800, square corners, no padding); up to five:

1. Banner's class search with ratings and plan tags
2. The popup, signed in, with an armed run and the request log
3. The popup's "Before you start" disclosure
4. The website's auto-register page with a queue armed

Optional: small promo tile 440×280, marquee 1400×560 (PNG or JPEG, little or no text).

## Privacy tab

**Single purpose:**

```
Helps Temple University students register for classes in Self-Service Banner: ratings and plan tags on Banner's class search, timed auto-registration of queued classes, and their DARS degree audit.
```

**Permission justifications:**

| Permission       | Justification                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| storage          | Saves the student's plans, settings, auto-register queue, consent and request log on the device, shared by the popup, the Banner overlay and the website.                                                                                                                                                                                                                                                                            |
| alarms           | Submits the armed auto-register queue at the student's registration time, and checks the Banner sign-in each minute while a run is armed.                                                                                                                                                                                                                                                                                            |
| notifications    | Tells the student a run is minutes away, whether it registered or failed, and when Banner signs them out while a run is armed.                                                                                                                                                                                                                                                                                                       |
| Host permissions | prd-xereg.temple.edu/StudentRegistrationSsb: the Banner overlay and Banner calls with the student's sign-in (terms, plans, CRN checks, the registration submit). prd-dars.temple.edu/selfservice: runs the student's DARS audit. tuportal6.temple.edu: reads the student's priority registration time for auto-register. betterssb.vercel.app: the BetterSSB website (the bridge to the extension) and its API (instructor ratings). |

**Remote code:** No, I am not using remote code.

**Data usage**, collected or used:

- Personally identifiable information: the DARS audit (name, student ID) passed to the BetterSSB website
- Authentication information: requests to Banner, DARS and TUportal use the student's existing sign-in cookies (never read or sent anywhere else)
- Website content: Banner class search results and the DARS audit

Leave the others unticked. Tick all three certifications (no selling or transfer outside the approved uses, no use unrelated to the single purpose, no creditworthiness or lending).

**Privacy policy URL:** https://betterssb.vercel.app/privacy

## Test instructions

```
No Temple account is needed to see the main feature.

1. Click the BetterSSB toolbar icon. Read "Before you start" and click Agree. (Until then the extension makes no requests and its icon shows "!".)
2. Open https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search, choose a term, Continue, and search a subject such as "Computer & Information Science". Each row shows a Rate My Professors rating before the instructor. (To see plan tags, first add a section from https://betterssb.vercel.app/search for the same term, then reload Banner.)
3. Open the popup again: it shows "Signed out of Banner" with a sign-in button, and lists every request the extension sent.

Auto-register, the DARS audit and Banner plans need a Temple student sign-in (SSO with Duo), which we can't share. Their code is in background.ts (auto-register alarms and submit), lib/ssb-api.ts (Banner calls) and dars.content.ts (the audit); the website at https://betterssb.vercel.app sets them up through the web bridge.
```

## Before submitting

- The deployed site serves https://betterssb.vercel.app/privacy.
- 2-Step Verification is on for the developer account.
- The developer account's contact email is current.

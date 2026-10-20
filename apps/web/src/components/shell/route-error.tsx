"use client";

import { CircleXIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { ButtonLink } from "@/components/button-link";

/** A page crashed. Says so plainly and offers a reload; the rest of the app keeps working. */
export function RouteError({ error }: { error: unknown }) {
  const detail = error instanceof Error ? error.message : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <title>Something went wrong · BetterSSB</title>
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>This page stopped working</AlertTitle>
        <AlertDescription>
          Your saved plans aren't affected. Reload to try again.
          {detail && (
            <span className="mt-1 block font-mono text-xs">{detail}</span>
          )}
        </AlertDescription>
      </Alert>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <ButtonLink variant="outline" href="/">
          Go to the home page
        </ButtonLink>
      </div>
    </div>
  );
}

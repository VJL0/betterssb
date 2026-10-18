import { CompassIcon } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { firstReadyPath } from "./pages";

export function NotFoundPage() {
  return (
    <div className="px-4 py-12">
      <title>Page not found · BetterSSB</title>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CompassIcon />
          </EmptyMedia>
          <EmptyTitle>
            <h1>Page not found</h1>
          </EmptyTitle>
          <EmptyDescription>
            That address doesn't match a BetterSSB page.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ButtonLink to={firstReadyPath()}>Back to BetterSSB</ButtonLink>
        </EmptyContent>
      </Empty>
    </div>
  );
}

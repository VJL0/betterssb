import { ExternalLinkIcon } from "lucide-react";
import {
  CRN_OUTCOME_BADGE,
  outcomeHeadline,
  type AutoRegBatchResultRecord,
} from "@workspace/shared/lib/auto-reg-batch-result";
import { Card } from "@workspace/ui/components/card";
import { StatusBadge } from "@workspace/ui/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { ButtonLink } from "@/components/button-link";
import { BANNER_REGISTRATION_URL } from "@/lib/config";
import { formatDateTime } from "@/lib/relative-time";

export function LastRun({ result }: { result: AutoRegBatchResultRecord }) {
  const heading =
    outcomeHeadline(result) ?? (result.ok ? "Submitted" : "Didn't go through");

  return (
    <Card
      aria-labelledby="last-run-heading"
      className="gap-3 p-5"
      render={<section />}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="last-run-heading" className="text-base font-medium">
            Last attempt · {heading}
          </h2>
          <p className="text-muted-foreground">
            Submitted {formatDateTime(result.at)}
            {result.registeredHours &&
              ` · ${result.registeredHours} credits registered`}
          </p>
        </div>
        <ButtonLink href={BANNER_REGISTRATION_URL} variant="outline" size="sm">
          Open in Banner
          <ExternalLinkIcon data-icon="inline-end" />
        </ButtonLink>
      </div>
      {result.error && <p className="text-destructive">{result.error}</p>}
      {result.crnResults.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Course</TableHead>
                <TableHead scope="col">CRN</TableHead>
                <TableHead scope="col">Result</TableHead>
                <TableHead scope="col">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.crnResults.map((line) => (
                <TableRow key={line.crn}>
                  <TableCell className="whitespace-normal">
                    {line.label || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{line.crn}</TableCell>
                  <TableCell>
                    <StatusBadge tone={CRN_OUTCOME_BADGE[line.outcome].tone}>
                      {CRN_OUTCOME_BADGE[line.outcome].label}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {line.detail}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

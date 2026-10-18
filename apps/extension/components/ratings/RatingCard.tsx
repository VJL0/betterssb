import { Badge } from "@workspace/ui/components/badge";
import { Card, CardContent } from "@workspace/ui/components/card";
import { cn } from "@workspace/ui/lib/utils";
import type { RmpRating } from "@workspace/api-client";

interface RatingCardProps {
  rating: RmpRating;
}

function scoreBoxClass(value: number): string {
  if (value >= 4) return "bg-success";
  if (value >= 3) return "bg-warning";
  return "bg-destructive";
}

function tagBadgeVariant(tag: string): "info" | "secondary" {
  const positive = [
    "amazing",
    "caring",
    "respected",
    "inspirational",
    "hilarious",
  ];
  return positive.some((p) => tag.toLowerCase().includes(p))
    ? "info"
    : "secondary";
}

export function RatingCard({ rating }: RatingCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4">
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl font-bold text-primary-foreground",
            scoreBoxClass(rating.overallRating),
          )}
        >
          {rating.overallRating.toFixed(1)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground">
            {rating.professorName}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {rating.department}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Difficulty</span>
              <div className="font-semibold">
                {rating.difficulty.toFixed(1)}/5
              </div>
            </div>
            {rating.wouldTakeAgainPct != null && (
              <div>
                <span className="text-muted-foreground">Would Take Again</span>
                <div className="font-semibold">
                  {Math.round(rating.wouldTakeAgainPct)}%
                </div>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Ratings</span>
              <div className="font-semibold">{rating.numRatings}</div>
            </div>
          </div>

          {rating.topTags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {rating.topTags.map((tag) => (
                <Badge key={tag} variant={tagBadgeVariant(tag)}>
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <a
            href={rating.rmpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-block text-sm text-primary hover:underline"
          >
            View on RateMyProfessors &rarr;
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

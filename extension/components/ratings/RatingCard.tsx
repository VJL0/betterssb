import type { RMPRating } from "@/types";
import { Card, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";

interface RatingCardProps {
  rating: RMPRating;
}

function scoreBoxClass(value: number): string {
  if (value >= 4) return "bg-green-600";
  if (value >= 3) return "bg-amber-500";
  return "bg-red-600";
}

function tagBadgeColor(tag: string): "blue" | "gray" {
  const positive = [
    "amazing",
    "caring",
    "respected",
    "inspirational",
    "hilarious",
  ];
  return positive.some((p) => tag.toLowerCase().includes(p)) ? "blue" : "gray";
}

export function RatingCard({ rating }: RatingCardProps) {
  return (
    <Card>
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-xl text-2xl font-bold text-white",
            scoreBoxClass(rating.overallRating),
          )}
        >
          {rating.overallRating.toFixed(1)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-gray-800">
            {rating.professorName}
          </div>
          <div className="mt-0.5 text-sm text-gray-500">
            {rating.department}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Difficulty</span>
              <div className="font-semibold">
                {rating.difficulty.toFixed(1)}/5
              </div>
            </div>
            {rating.wouldTakeAgainPct != null && (
              <div>
                <span className="text-gray-500">Would Take Again</span>
                <div className="font-semibold">
                  {Math.round(rating.wouldTakeAgainPct)}%
                </div>
              </div>
            )}
            <div>
              <span className="text-gray-500">Ratings</span>
              <div className="font-semibold">{rating.numRatings}</div>
            </div>
          </div>

          {rating.topTags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {rating.topTags.map((tag) => (
                <Badge key={tag} text={tag} color={tagBadgeColor(tag)} />
              ))}
            </div>
          )}

          <a
            href={rating.rmpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 inline-block text-sm text-indigo-600 hover:underline"
          >
            View on RateMyProfessors &rarr;
          </a>
        </div>
      </div>
    </Card>
  );
}

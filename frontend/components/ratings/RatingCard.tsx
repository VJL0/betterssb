import type { RMPRating } from "@/types";
import { Card, Badge } from "@/components/ui";

interface RatingCardProps {
  rating: RMPRating;
}

function ratingColor(value: number): string {
  if (value >= 4) return "#16a34a";
  if (value >= 3) return "#ca8a04";
  return "#dc2626";
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
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "12px",
            background: ratingColor(rating.overallRating),
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "22px",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {rating.overallRating.toFixed(1)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#1f2937" }}>
            {rating.professorName}
          </div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
            {rating.department}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginTop: "12px",
              fontSize: "13px",
            }}
          >
            <div>
              <span style={{ color: "#6b7280" }}>Difficulty</span>
              <div style={{ fontWeight: 600 }}>
                {rating.difficulty.toFixed(1)}/5
              </div>
            </div>
            {rating.wouldTakeAgainPct != null && (
              <div>
                <span style={{ color: "#6b7280" }}>Would Take Again</span>
                <div style={{ fontWeight: 600 }}>
                  {Math.round(rating.wouldTakeAgainPct)}%
                </div>
              </div>
            )}
            <div>
              <span style={{ color: "#6b7280" }}>Ratings</span>
              <div style={{ fontWeight: 600 }}>{rating.numRatings}</div>
            </div>
          </div>

          {rating.topTags.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                marginTop: "10px",
              }}
            >
              {rating.topTags.map((tag) => (
                <Badge key={tag} text={tag} color={tagBadgeColor(tag)} />
              ))}
            </div>
          )}

          <a
            href={rating.rmpUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              marginTop: "10px",
              fontSize: "13px",
              color: "#4f46e5",
              textDecoration: "none",
            }}
          >
            View on RateMyProfessors &rarr;
          </a>
        </div>
      </div>
    </Card>
  );
}

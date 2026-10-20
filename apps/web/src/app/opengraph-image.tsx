import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/config";

export const alt = `${SITE_NAME}: the registration tool Banner should have shipped`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0a0a0a";
const MUTED = "#525252";

/** The social card, drawn once at build time. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#ffffff",
        color: INK,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="102" height="42" viewBox="0 0 34 14">
          <line x1="7" y1="7" x2="27" y2="7" stroke={INK} strokeWidth="3" />
          <circle
            cx="7"
            cy="7"
            r="5.5"
            fill="#ffffff"
            stroke={INK}
            strokeWidth="3"
          />
          <circle cx="27" cy="7" r="5.5" fill={INK} />
        </svg>
        <span style={{ fontSize: 44, fontWeight: 600 }}>{SITE_NAME}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <span
          style={{
            fontSize: 76,
            fontWeight: 600,
            lineHeight: 1.05,
            letterSpacing: -2,
          }}
        >
          The registration tool Banner should have shipped.
        </span>
        <span style={{ fontSize: 32, color: MUTED }}>
          Search sections with ratings and seats, build conflict-free schedules,
          and register the second your window opens.
        </span>
      </div>
    </div>,
    size,
  );
}

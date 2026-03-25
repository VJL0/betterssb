type BadgeColor = "green" | "yellow" | "red" | "blue" | "gray";

interface BadgeProps {
  text: string;
  color?: BadgeColor;
}

const colorMap: Record<BadgeColor, { bg: string; fg: string }> = {
  green: { bg: "#dcfce7", fg: "#166534" },
  yellow: { bg: "#fef9c3", fg: "#854d0e" },
  red: { bg: "#fee2e2", fg: "#991b1b" },
  blue: { bg: "#dbeafe", fg: "#1e40af" },
  gray: { bg: "#f3f4f6", fg: "#374151" },
};

export function Badge({ text, color = "gray" }: BadgeProps) {
  const { bg, fg } = colorMap[color];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 500,
        background: bg,
        color: fg,
        lineHeight: 1.5,
      }}
    >
      {text}
    </span>
  );
}

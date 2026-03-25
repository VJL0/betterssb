interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 18 }: SpinnerProps) {
  const borderWidth = Math.max(2, Math.round(size / 8));

  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${borderWidth}px solid #e5e7eb`,
        borderTopColor: "#4f46e5",
        borderRadius: "50%",
        animation: "betterssb-spin 0.6s linear infinite",
      }}
    >
      <style>{`@keyframes betterssb-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

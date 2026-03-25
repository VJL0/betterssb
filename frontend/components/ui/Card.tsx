import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  padding: "16px",
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 12px 0",
  fontSize: "15px",
  fontWeight: 600,
  color: "#1f2937",
};

export function Card({ title, children, className }: CardProps) {
  return (
    <div style={cardStyle} className={className}>
      {title && <h3 style={titleStyle}>{title}</h3>}
      {children}
    </div>
  );
}

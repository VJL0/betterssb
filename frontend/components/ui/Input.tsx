import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const wrapperStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "14px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  fontFamily: "inherit",
  outline: "none",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

const errorStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#dc2626",
};

export function Input({ label, error, style, ...rest }: InputProps) {
  return (
    <div style={wrapperStyle}>
      {label && <label style={labelStyle}>{label}</label>}
      <input
        style={{
          ...inputStyle,
          borderColor: error ? "#dc2626" : "#d1d5db",
          ...style,
        }}
        {...rest}
      />
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}

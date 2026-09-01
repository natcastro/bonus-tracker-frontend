export default function StatusPill({
  label, color, solid, soft,
}: { label: string; color: string; solid?: boolean; soft?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 700,
      borderRadius: 5, padding: "3px 9px", whiteSpace: "nowrap", lineHeight: 1.3,
      background: solid ? color : (soft ?? color + "18"),
      color: solid ? "#fff" : color,
    }}>
      {label}
    </span>
  );
}

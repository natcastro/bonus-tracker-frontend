export default function StatusPill({
  label, color, solid, soft,
}: { label: string; color: string; solid?: boolean; soft?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 500,
      borderRadius: 999, padding: "3px 11px", whiteSpace: "nowrap", lineHeight: 1.3,
      background: solid ? color : (soft ?? color + "18"),
      color: solid ? "#fff" : color,
    }}>
      {label}
    </span>
  );
}

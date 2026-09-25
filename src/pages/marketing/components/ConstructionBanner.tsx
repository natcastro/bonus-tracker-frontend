// Marks a section that's still WIP / not yet announced to the team — remove this wrapper once
// the feature is ready to go live and Natalie has reviewed it locally.
export default function ConstructionBanner({ label }: { label?: string }) {
  return (
    <div style={{
      background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13,
      textAlign: "center", padding: "0.6rem 1rem", borderRadius: 8, marginBottom: "1.25rem",
      letterSpacing: "0.01em",
    }}>
      🚧 EN CONSTRUCCIÓN{label ? ` — ${label}` : ""} — todavía no está publicado para el equipo
    </div>
  );
}

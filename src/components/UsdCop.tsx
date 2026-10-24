// Operations works in US dollars; the company keeps a fixed internal rate to show the cost in Colombian pesos too.
// It is NOT the market rate — change it here if the company changes it.
export const COP_PER_USD = 3650;

export const formatCop = (usd: number) => `$${Math.round(usd * COP_PER_USD).toLocaleString("es-CO")} COP`;

// Dollars on top, pesos right below (small, muted). `inline` puts both on one line, for sentences and dropdown text.
export default function UsdCop({ v, inline, plus }: { v: number; inline?: boolean; plus?: boolean }) {
  const usd = `${plus ? "+" : ""}$${v.toFixed(2)}`;
  if (inline) return <>{usd} <span style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>· {formatCop(v)}</span></>;
  return (
    <>
      {usd}
      <span style={{ display: "block", color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: 400, lineHeight: 1.3 }}>{formatCop(v)}</span>
    </>
  );
}

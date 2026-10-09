import type { ReactNode } from "react";

export const COLOR = "#0f766e";

export function Banner({ tone, children }: { tone: "info" | "warn" | "ok" | "bad"; children: ReactNode }) {
  const t = { info: ["#e0f2fe", "#075985"], warn: ["#fef3c7", "#92400e"], ok: ["#dcfce7", "#166534"], bad: ["#fee2e2", "#991b1b"] }[tone];
  return <div style={{ background: t[0], color: t[1], borderRadius: 8, padding: "0.6rem 1rem", fontSize: "0.85rem", marginBottom: "1rem" }}>{children}</div>;
}

export function Stat({ label, value, sub, grey }: { label: string; value: ReactNode; sub?: ReactNode; grey?: boolean }) {
  return (
    <div className="stat-card" style={{ borderTopColor: grey ? "#cbd5e1" : COLOR, opacity: grey ? 0.8 : 1, background: grey ? "#f8fafc" : undefined }}>
      <h3>{label}</h3>
      <div className="amount" style={{ color: grey ? "#64748b" : COLOR, fontSize: "1.5rem" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1rem" }}>
      {tabs.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} style={{
          fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "7px 14px", borderRadius: 999,
          border: `1px solid ${value === k ? COLOR : "#e2e8f0"}`, background: value === k ? `${COLOR}14` : "#fff", color: value === k ? COLOR : "#64748b",
        }}>{l}</button>
      ))}
    </div>
  );
}

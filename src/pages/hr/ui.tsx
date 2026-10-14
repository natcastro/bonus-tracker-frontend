import type { ReactNode } from "react";

export const COLOR = "#0f766e";
export type RoleKind = "hr" | "accounting" | "supervisor" | "employee";

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

export function Avatar({ name, role, size = 46 }: { name: string; role: RoleKind; size?: number }) {
  return <span className="hr-avatar" data-role={role} style={{ ["--sz" as string]: `${size}px` }} aria-hidden>{initials(name)}</span>;
}

// Greeting block at the top of every role's page.
export function PageHeader({ role, name, title, subtitle, chip, right }: { role: RoleKind; name: string; title: string; subtitle?: ReactNode; chip?: string; right?: ReactNode }) {
  return (
    <div className="hr-pagehead" data-role={role}>
      <div className="hr-pagehead__who">
        <Avatar name={name} role={role} />
        <div style={{ minWidth: 0 }}>
          <h2>{title}{chip && <span className="hr-rolechip">{chip}</span>}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Banner({ tone, children }: { tone: "info" | "warn" | "ok" | "bad"; children: ReactNode }) {
  return <div className={`hr-banner hr-banner--${tone}`} role={tone === "bad" ? "alert" : "status"}><div>{children}</div></div>;
}

export function Stat({ label, value, sub, grey, strong }: { label: string; value: ReactNode; sub?: ReactNode; grey?: boolean; strong?: boolean }) {
  return (
    <div className={`stat-card${grey ? " hr-stat-locked" : ""}${strong ? " hr-stat-total" : ""}`}>
      <h3>{grey ? "🔒 " : ""}{label}</h3>
      <div className="amount">{value}</div>
      {sub && <div style={{ fontSize: "0.74rem", color: "var(--hr-muted)", lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="hr-tabs" role="tablist">
      {tabs.map(([k, l]) => (
        <button key={k} role="tab" className="hr-tab" aria-selected={value === k} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export function Empty({ title, hint, icon = "✓" }: { title: string; hint?: ReactNode; icon?: string }) {
  return (
    <div className="hr-empty">
      <div className="hr-empty__icon" aria-hidden>{icon}</div>
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

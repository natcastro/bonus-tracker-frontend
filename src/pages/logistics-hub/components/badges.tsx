import { HT, PLATFORM_CFG, STATUS_CFG, LOCATION_CFG, slaTier, slaColor, formatAge } from "../theme";
import type { Platform, WorkflowStatus } from "../types";

export function PlatformBadge({ platform }: { platform: Platform }) {
  const cfg = PLATFORM_CFG[platform];
  return (
    <span style={{
      fontFamily: HT.font, fontSize: 11, fontWeight: 700,
      background: cfg.bg, color: cfg.fg,
      borderRadius: 6, padding: "3px 8px", letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

export function StatusBadge({ status }: { status: WorkflowStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span style={{
      fontFamily: HT.font, fontSize: 12, fontWeight: 600,
      background: cfg.bg, color: cfg.fg,
      borderRadius: 999, padding: "4px 10px",
      display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.fg }} />
      {cfg.label}
    </span>
  );
}

export function LocationTag({ location }: { location?: string }) {
  if (!location) return <span style={{ color: HT.text3, fontSize: 13 }}>—</span>;
  const color = LOCATION_CFG[location]?.color ?? HT.text2;
  return (
    <span style={{
      fontFamily: HT.font, fontSize: 12.5, fontWeight: 600, color: HT.text1,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {location}
    </span>
  );
}

export function AgeChip({ createdAt }: { createdAt: string }) {
  const tier = slaTier(createdAt);
  const { fg, bg } = slaColor(tier);
  return (
    <span style={{
      fontFamily: HT.mono, fontSize: 12, fontWeight: 700,
      background: bg, color: fg, borderRadius: 6, padding: "3px 7px",
    }}>{formatAge(createdAt)}</span>
  );
}

export function DocPill({ label, state }: { label: string; state: "none" | "generating" | "ready" | "missing" | "failed" }) {
  const map: Record<string, { fg: string; bg: string; text: string }> = {
    none: { fg: HT.text3, bg: HT.surfaceAlt, text: "—" },
    generating: { fg: HT.info, bg: HT.infoSoft, text: "Generando…" },
    ready: { fg: HT.success, bg: HT.successSoft, text: "Listo" },
    missing: { fg: HT.warn, bg: HT.warnSoft, text: "Falta" },
    failed: { fg: HT.danger, bg: HT.dangerSoft, text: "Falló" },
  };
  const c = map[state];
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: HT.font, fontSize: 10, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
      <span style={{
        fontFamily: HT.font, fontSize: 12, fontWeight: 600, color: c.fg, background: c.bg,
        borderRadius: 6, padding: "2px 7px", width: "fit-content",
      }}>{c.text}</span>
    </span>
  );
}

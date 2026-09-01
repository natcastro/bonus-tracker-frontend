// Design tokens for Logistics Hub — its own visual identity (indigo/enterprise SaaS),
// distinct from the legacy Logística dashboard so the two feel intentionally separate.
export const HT = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F2F7",
  border: "rgba(15,23,42,0.08)",
  borderStrong: "rgba(15,23,42,0.16)",
  text1: "#0F172A",
  text2: "#5B6472",
  text3: "#96A1AF",

  primary: "#4F46E5",
  primaryDark: "#3F37C9",
  primarySoft: "#EEEDFD",

  info: "#2563EB",
  infoSoft: "#EAF1FF",
  warn: "#D97706",
  warnSoft: "#FEF3E2",
  warnStrong: "#EA580C",
  warnStrongSoft: "#FFEBDD",
  danger: "#DC2626",
  dangerSoft: "#FDECEC",
  success: "#16A34A",
  successSoft: "#E9F9EF",

  shadow: "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.05)",
  shadowLg: "0 4px 16px rgba(15,23,42,0.08), 0 24px 48px rgba(15,23,42,0.10)",

  font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`,
  mono: `"SF Mono", "Menlo", "Monaco", Consolas, monospace`,

  radius: 12,
  radiusLg: 16,
};

export const PLATFORM_CFG: Record<
  string,
  { label: string; bg: string; fg: string }
> = {
  tiktok: { label: "TikTok", bg: "#111827", fg: "#FFFFFF" },
  amazon: { label: "Amazon", bg: "#FEF3E2", fg: "#92400E" },
  shopify: { label: "Online", bg: "#EAF1FF", fg: "#1D4ED8" },
};

export const LOCATION_CFG: Record<
  string,
  { color: string }
> = {
  Belier: { color: "#2563EB" },
  Norte: { color: "#7C3AED" },
  Plaza: { color: "#DB2777" },
  Colombia: { color: "#D97706" },
};

export const STATUS_CFG: Record<
  string,
  { label: string; fg: string; bg: string }
> = {
  unassigned: { label: "Sin asignar", fg: "#5B6472", bg: "#F1F2F7" },
  pending_logistics: { label: "Pendiente de Logística", fg: "#1D4ED8", bg: "#EAF1FF" },
  pending_store: { label: "Pendiente de Tienda", fg: "#6D28D9", bg: "#F1EBFE" },
  completed: { label: "Completado", fg: "#15803D", bg: "#E9F9EF" },
  attention: { label: "Requiere atención", fg: "#B91C1C", bg: "#FDECEC" },
};

export function hoursOld(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export function formatAge(iso: string): string {
  const h = hoursOld(iso);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}min`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  return rem > 0 ? `${d}d ${rem}h` : `${d}d`;
}

// SLA tiers per spec: 0-12h normal, 12-20h light warning, 20-24h strong warning, +24h critical
export function slaTier(iso: string): "normal" | "warn" | "warnStrong" | "critical" {
  const h = hoursOld(iso);
  if (h >= 24) return "critical";
  if (h >= 20) return "warnStrong";
  if (h >= 12) return "warn";
  return "normal";
}

export function slaColor(tier: ReturnType<typeof slaTier>): { fg: string; bg: string } {
  switch (tier) {
    case "critical": return { fg: HT.danger, bg: HT.dangerSoft };
    case "warnStrong": return { fg: HT.warnStrong, bg: HT.warnStrongSoft };
    case "warn": return { fg: HT.warn, bg: HT.warnSoft };
    default: return { fg: HT.text2, bg: HT.surfaceAlt };
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

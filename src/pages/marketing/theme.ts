// Design tokens for the Marketing module — same clean white/neutral system as the
// FTC Hub Landing screen, keeping only the brand green (Laura) / clay (Diseño)
// role colors as accents.
export const MT = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#F8F9FA",
  border: "#EEEEEE",
  borderStrong: "#E5E7EB",
  text1: "#111827",
  text2: "#6B7280",
  text3: "#9CA3AF",

  primary: "#3E6B45",
  primaryDark: "#2E5033",
  primarySoft: "#E4EEE2",

  moss: "#8A9B4E",
  mossSoft: "#EEF1DE",

  clay: "#B15E3B",
  claySoft: "#F3E3D8",

  warn: "#B08526",
  warnSoft: "#F4EBD3",
  danger: "#A6432B",
  dangerSoft: "#F5E1DA",
  success: "#3E6B45",
  successSoft: "#E4EEE2",
  info: "#4F6D8C",
  infoSoft: "#E6EDF3",

  shadow: "0 1px 2px rgba(17,24,39,0.04), 0 8px 24px rgba(17,24,39,0.05)",
  shadowLg: "0 4px 16px rgba(17,24,39,0.08), 0 24px 48px rgba(17,24,39,0.10)",

  font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`,
  mono: `"SF Mono", "Menlo", "Monaco", Consolas, monospace`,

  radius: 10,
  radiusLg: 14,
};

export const ROLE_CFG: Record<string, { label: string; color: string; soft: string }> = {
  laura: { label: "Laura", color: MT.primary, soft: MT.primarySoft },
  diseno: { label: "Diseño", color: MT.clay, soft: MT.claySoft },
  carol: { label: "Karol", color: MT.info, soft: MT.infoSoft },
};

export function formatDateHuman(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `hace ${diffD} d`;
}

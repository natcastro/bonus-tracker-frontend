// Design tokens for the Marketing module — earthy, green-forward palette
// aligned with the Forma Tu Cuerpo brand green, distinct from the other
// hubs' cooler palettes (indigo Logistics Hub, etc).
export const MT = {
  bg: "#F6F3EA",
  surface: "#FFFFFF",
  surfaceAlt: "#EFE9DA",
  border: "rgba(70,60,40,0.12)",
  borderStrong: "rgba(70,60,40,0.22)",
  text1: "#2C2A20",
  text2: "#6B6350",
  text3: "#9E9580",

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

  shadow: "0 1px 2px rgba(44,42,32,0.05), 0 8px 24px rgba(44,42,32,0.06)",
  shadowLg: "0 4px 16px rgba(44,42,32,0.10), 0 24px 48px rgba(44,42,32,0.12)",

  font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`,
  mono: `"SF Mono", "Menlo", "Monaco", Consolas, monospace`,

  radius: 12,
  radiusLg: 16,
};

export const ROLE_CFG: Record<string, { label: string; color: string; soft: string }> = {
  laura: { label: "Laura", color: MT.primary, soft: MT.primarySoft },
  diseno: { label: "Diseño", color: MT.clay, soft: MT.claySoft },
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

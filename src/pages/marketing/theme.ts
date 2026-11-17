// Design tokens for the Marketing module — same clean white/neutral system as the
// FTC Hub Landing screen, keeping only the brand green (Laura) / clay (Diseño)
// role colors as accents.
export const MT = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceAlt: "#FAFAF8",
  border: "#E8E7E2",
  borderStrong: "#D6D5CE",
  text1: "#1F1E1C",
  text2: "#6F6E67",
  text3: "#A3A29B",

  primary: "#1F1E1C",
  primaryDark: "#3A3936",
  primarySoft: "#F4F4F1",

  moss: "#8A9B4E",
  mossSoft: "#EEF1DE",

  clay: "#B15E3B",
  claySoft: "#F5E3D6",

  warn: "#B08526",
  warnSoft: "#F4EBD3",
  danger: "#A6432B",
  dangerSoft: "#F5E1DA",
  success: "#3E7D3A",
  successSoft: "#E2EFD9",
  info: "#4F6D8C",
  infoSoft: "#DCE8F1",
  violet: "#6B5B95",
  violetSoft: "#E9E4F3",

  shadow: "0 1px 2px rgba(31,30,28,0.04)",
  shadowLg: "0 2px 6px rgba(31,30,28,0.06), 0 24px 48px -16px rgba(31,30,28,0.22)",

  // Same brand font (Lato) every other module's shared index.css already uses.
  font: `var(--font-body), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
  mono: `var(--font-mono), "SF Mono", "Menlo", "Monaco", Consolas, monospace`,

  radius: 8,
  radiusLg: 10,
};

export const ROLE_CFG: Record<string, { label: string; color: string; soft: string }> = {
  laura: { label: "Laura", color: "#5E7A2E", soft: "#EEF3DC" },
  diseno: { label: "Diseño", color: MT.clay, soft: MT.claySoft },
  carol: { label: "Karol", color: MT.info, soft: MT.infoSoft },
  video: { label: "Video", color: MT.violet, soft: MT.violetSoft },
  requester: { label: "Solicitante", color: MT.violet, soft: MT.violetSoft },
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

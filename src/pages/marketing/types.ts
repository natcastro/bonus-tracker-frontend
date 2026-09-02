export type MarketingRole = "laura" | "diseno";

export const PRODUCT_LINES = [
  "Línea Oro",
  "Luxury Queen",
  "Sport",
  "Masculina",
  "Comfort",
  "Accesorios",
  "Fajas Invisibles",
  "Línea Sensual",
] as const;
export type StageKey = "brief" | "proposal" | "review1" | "adjustments" | "review2" | "adjustments2" | "final" | "publish";

export interface MarketingStage {
  key: StageKey;
  label: string;
  role: MarketingRole;
  gapDays: number; // days allotted for this stage, counted from the previous stage's actual completion
  deadline: string | null; // yyyy-mm-dd — null until the previous stage is done and this one becomes current
  link: string | null;
  completedAt: string | null; // yyyy-mm-dd
  status: "pending" | "done";
  decision?: "approved" | "changes_requested" | "extra_revision";
  late?: boolean;
  reminded24h?: boolean;
}

export interface MarketingBrief {
  id: number;
  reference: string;
  productLine: string;
  startDate: string;
  currentStage: StageKey | "completed";
  status: "in_progress" | "completed";
  stages: MarketingStage[];
  shiftDays: number;
  lauraDelayDays: number;
  designDelayCount: number;
  extraRevisionRounds: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Which Diseño team member's email this brief's notifications go to, once someone claims
  // it — null means unclaimed, so Diseño-directed emails still broadcast to everyone.
  assignedDisenoEmail: string | null;
}

export interface MarketingNotification {
  id: number;
  briefId: number | null;
  message: string;
  createdAt: string;
  readLaura: boolean;
  readDiseno: boolean;
}

export interface MarketingUser {
  role: MarketingRole;
  name: string;
}

// gapDays is always counted from the previous stage's actual completion date — never from the
// brief's original start date — so a fast (or slow) turnaround never shrinks or balloons the next deadline.
export const STAGE_DEFS: { key: StageKey; label: string; role: MarketingRole; gapDays: number }[] = [
  { key: "brief",       label: "Brief",        role: "laura",  gapDays: 0 },
  { key: "proposal",    label: "Propuesta",    role: "diseno", gapDays: 2 },
  { key: "review1",     label: "Revisión 1",   role: "laura",  gapDays: 2 },
  { key: "adjustments", label: "Ajustes",      role: "diseno", gapDays: 2 },
  { key: "review2",     label: "Revisión 2",   role: "laura",  gapDays: 1 },
  { key: "adjustments2", label: "Ajustes 2",   role: "diseno", gapDays: 2 },
  { key: "final",       label: "Final",        role: "laura",  gapDays: 2 },
  { key: "publish",     label: "Publicación",  role: "diseno", gapDays: 2 },
];

export const STAGE_ORDER: StageKey[] = STAGE_DEFS.map(s => s.key);

export function stageLabel(key: StageKey | "completed"): string {
  if (key === "completed") return "Completado";
  return STAGE_DEFS.find(s => s.key === key)?.label ?? key;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Adds `days` counted from the given date, skipping Sundays entirely (no work happens on
// Sunday, so it never counts toward the gap and a deadline never lands on one).
export function addWorkDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:)?\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

// All deadlines cut off at 5:00 PM Colombia time (fixed UTC-5, no DST).
export function deadlineTimestamp(dateIso: string): number {
  return new Date(`${dateIso}T17:00:00-05:00`).getTime();
}

export function isPastDeadline(dateIso: string): boolean {
  return Date.now() > deadlineTimestamp(dateIso);
}

export function todayIsoBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export type MarketingRole = "laura" | "diseno" | "carol";

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

export const PUBLICATION_PLATFORMS = [
  { key: "tiktokShop",     label: "TikTok Shop" },
  { key: "tiktokShopMx",   label: "TikTok Shop México" },
  { key: "amazon",         label: "Amazon" },
  { key: "shopify",        label: "Shopify" },
  { key: "mercadoLibreMx", label: "Mercado Libre México" },
  { key: "mercadoLibreCo", label: "Mercado Libre Colombia" },
] as const;
export type PublicationPlatform = typeof PUBLICATION_PLATFORMS[number]["key"];
export type PublicationLinks = Partial<Record<PublicationPlatform, string>>;

export interface MarketingBrief {
  id: number;
  reference: string;
  productLine: string;
  startDate: string;
  // Only set while status is "draft" — Laura's planning estimate, not a real deadline anchor.
  estimatedStartDate: string | null;
  currentStage: StageKey | "completed";
  // "draft" = private pending task, not yet started and not visible/notified to anyone else.
  status: "draft" | "in_progress" | "completed";
  stages: MarketingStage[];
  shiftDays: number;
  lauraDelayDays: number;
  designDelayCount: number;
  extraRevisionRounds: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Which Diseño team member this brief is assigned to — set by Laura (at creation/publish) or
  // by Carol afterward. Diseño people can no longer self-assign; null just means "not assigned yet".
  assignedDisenoEmail: string | null;
  // Timestamp set when a brief goes public unassigned (Carol gets notified) — used by the 24h
  // auto-assign job to detect briefs Carol hasn't picked up in time.
  carolNotifiedAt: string | null;
  // Once the brief is completed, these track posting the product live on each sales channel —
  // Karol reviews the count and signs off once all of them are filled in.
  publicationLinks: PublicationLinks;
  linksApprovedByKarol: boolean;
}

export interface MarketingNotification {
  id: number;
  briefId: number | null;
  message: string;
  createdAt: string;
  readLaura: boolean;
  readDiseno: boolean;
  readCarol: boolean;
}

// A personal reminder/to-do — visible only to whoever created it, unlike a brief.
export interface PrivateTask {
  id: number;
  ownerEmail: string;
  title: string;
  dueAt: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface MarketingUser {
  role: MarketingRole;
  name: string;
  // The actual Microsoft login email — used to tell individual Diseño people apart, since they
  // all share the same "diseno" role and only this identifies which one is logged in.
  email: string;
}

// gapDays is always counted from the previous stage's actual completion date — never from the
// brief's original start date — so a fast (or slow) turnaround never shrinks or balloons the next deadline.
export const STAGE_DEFS: { key: StageKey; label: string; role: MarketingRole; gapDays: number }[] = [
  { key: "brief",       label: "Brief",        role: "laura",  gapDays: 0 },
  { key: "proposal",    label: "Propuesta inicial", role: "diseno", gapDays: 4 },
  { key: "review1",     label: "Revisión 1",   role: "laura",  gapDays: 2 },
  { key: "adjustments", label: "Ajuste 1",     role: "diseno", gapDays: 2 },
  { key: "review2",     label: "Revisión 2",   role: "laura",  gapDays: 2 },
  { key: "adjustments2", label: "Ajustes 2",   role: "diseno", gapDays: 2 },
  { key: "final",       label: "Revisión Final", role: "laura", gapDays: 1 },
  { key: "publish",     label: "Publicación",  role: "diseno", gapDays: 1 },
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

// Adds `days` counted from the given date, skipping Saturdays and Sundays entirely — the
// design team only works Monday through Friday, so weekends never count toward the gap and a
// deadline never lands on one.
export function addWorkDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00").getTime();
  const b = new Date(toIso + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

// ── To Do tasks — Carol's own quick-turnaround requests, separate from Laura's briefs ──────
// Shorter pipeline (3 business days a stage instead of the brief's 4/2/2/2/1/1) and no
// Diseño-confirms-publish step — Carol's own final approval is the terminal state.

export const TODO_TASK_TYPES = [
  "Post redes sociales rectangular (1080 x 1350 px)",
  "Post redes sociales cuadrado (1080 x 1080 px)",
  "Portada de Facebook (851 x 315 px)",
  "Banner página web",
  "Fotos optimizadas web (1000 x 1200 px)",
  "Comunicación para compartir x WhatsApp",
  "Story Instagram (1080 x 1920 px)",
  "Invitación digital",
  "Otro",
] as const;

export type TodoStageKey = "proposal" | "review" | "adjustments" | "finalReview" | "finalAdjustments" | "approved";

export interface TodoStage {
  key: TodoStageKey;
  label: string;
  role: "diseno" | "carol";
  gapDays: number;
  deadline: string | null;
  link: string | null;
  completedAt: string | null;
  status: "pending" | "done";
  decision?: "approved" | "changes_requested";
  late?: boolean;
}

export const TODO_STAGE_DEFS: { key: TodoStageKey; label: string; role: "diseno" | "carol"; gapDays: number }[] = [
  { key: "proposal",         label: "Primera propuesta", role: "diseno", gapDays: 3 },
  { key: "review",           label: "Revisión",          role: "carol",  gapDays: 3 },
  { key: "adjustments",      label: "Ajuste 1",          role: "diseno", gapDays: 3 },
  { key: "finalReview",      label: "Revisión final",    role: "carol",  gapDays: 3 },
  { key: "finalAdjustments", label: "Últimos ajustes",   role: "diseno", gapDays: 3 },
  { key: "approved",         label: "Aprobado",          role: "carol",  gapDays: 3 },
];

export function todoStageLabel(key: TodoStageKey | "completed"): string {
  if (key === "completed") return "Completado";
  return TODO_STAGE_DEFS.find(s => s.key === key)?.label ?? key;
}

export interface TodoTask {
  id: number;
  taskType: string;
  title: string;
  assignedDisenoEmail: string;
  currentStage: TodoStageKey | "completed";
  status: "in_progress" | "completed";
  stages: TodoStage[];
  createdAt: string;
  completedAt: string | null;
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

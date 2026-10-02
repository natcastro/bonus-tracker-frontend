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
  role: "laura" | "diseno";
  gapDays: number; // days allotted for this stage, counted from the previous stage's actual completion
  deadline: string | null; // yyyy-mm-dd — null until the previous stage is done and this one becomes current
  link: string | null;
  completedAt: string | null; // yyyy-mm-dd
  status: "pending" | "done";
  decision?: "approved" | "changes_requested" | "extra_revision";
  late?: boolean;
  // Written by the check-deadline-reminders Netlify function — tracks which scheduled
  // deadline-alert emails have already gone out for this stage, so it never double-sends.
  remind24hAt?: string;
  remind12hAt?: string;
  remind1hAt?: string;
  overdueLastRemindAt?: string;
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

// ── Variants — some products come in up to 4 physical variants, each needing its own proposal,
// review and approval cycle instead of sharing one. Laura picks which apply when she creates the
// brief; unselected ones are "No aplica" from the start, no justification needed.

export type VariantKey = "es_beige" | "es_negro" | "en_beige" | "en_negro";

export const VARIANT_DEFS: { key: VariantKey; label: string }[] = [
  { key: "es_beige", label: "Español – Beige" },
  { key: "es_negro", label: "Español – Negro" },
  { key: "en_beige", label: "Inglés – Beige" },
  { key: "en_negro", label: "Inglés – Negro" },
];

export function variantLabel(key: VariantKey): string {
  return VARIANT_DEFS.find(v => v.key === key)?.label ?? key;
}

export function variantLabels(keys: VariantKey[]): string {
  return keys.map(variantLabel).join(" y ");
}

export interface BriefVariant {
  key: VariantKey;
  // false = "No aplica" — either never selected at creation, or marked so later with a reason.
  applicable: boolean;
  naReason: string | null;
  currentStage: StageKey | "completed";
  status: "in_progress" | "completed";
  stages: MarketingStage[];
  lauraDelayDays: number;
  designDelayCount: number;
  extraRevisionRounds: number;
  completedAt: string | null;
}

// Maps the underlying stage pipeline onto her 7 flat statuses — an approximation, since the real
// pipeline has 2 review rounds and this list doesn't, but it covers every state a variant passes through.
export function variantStatusLabel(v: BriefVariant): string {
  if (!v.applicable) return "No aplica";
  if (v.status === "completed") return "Aprobada";
  const stage = v.stages.find(s => s.key === v.currentStage);
  if (!stage) return "Pendiente";
  const startedAny = v.stages.some(s => s.status === "done");
  if (stage.key === "publish") return "Entregada";
  if (stage.role === "laura") return "En revisión";
  // role === "diseno": either nothing's been delivered yet, or Laura just asked for changes.
  const lastDoneWasChangesRequested = [...v.stages].reverse().find(s => s.status === "done")?.decision === "changes_requested";
  if (!startedAny) return "Pendiente";
  return lastDoneWasChangesRequested ? "Cambios solicitados" : "Pendiente";
}

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
  // Non-null means this brief tracks up to 4 variants independently instead of a single pipeline —
  // when present, `stages`/`currentStage` above are unused and each variant has its own.
  variants: BriefVariant[] | null;
}

export interface MarketingNotification {
  id: number;
  briefId: number | null;
  // Set only for requester-specific pings (a request's own creator, tracking it via its public
  // link) — when present, this notification is scoped to that one email instead of a shared role inbox.
  requestId: number | null;
  targetEmail: string | null;
  // Whoever performed the action this notification is about — used to hide a notification from
  // the very person who caused it (you don't need to be told about your own action), while still
  // showing it to everyone else who shares that role/inbox.
  actorEmail: string | null;
  message: string;
  createdAt: string;
  readLaura: boolean;
  readDiseno: boolean;
  readCarol: boolean;
  readTarget: boolean;
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
export const STAGE_DEFS: { key: StageKey; label: string; role: "laura" | "diseno"; gapDays: number }[] = [
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

// A brief's currently-pending stage(s) — one for a plain brief, or one per applicable
// in-progress variant for a variant-mode brief. Used anywhere "whose turn is it" or "what's the
// deadline" needs to work the same way regardless of which mode the brief is in.
export function currentActiveStages(brief: MarketingBrief): MarketingStage[] {
  if (brief.variants) {
    return brief.variants
      .filter(v => v.applicable && v.status === "in_progress")
      .map(v => v.stages.find(s => s.key === v.currentStage))
      .filter((s): s is MarketingStage => !!s);
  }
  const stage = brief.stages.find(s => s.key === brief.currentStage);
  return stage ? [stage] : [];
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
  // Written by the check-deadline-reminders Netlify function — tracks which scheduled
  // deadline-alert emails have already gone out for this stage, so it never double-sends.
  remind24hAt?: string;
  remind12hAt?: string;
  remind1hAt?: string;
  overdueLastRemindAt?: string;
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
  description: string;
  assignedDisenoEmail: string;
  currentStage: TodoStageKey | "completed";
  status: "in_progress" | "completed";
  stages: TodoStage[];
  createdAt: string;
  completedAt: string | null;
}

// ── Requests — created via a public link (no Marketing role needed, just a company Microsoft
// login), always fulfilled by Diseño, with a review/approve-or-changes loop the requester controls.

export type RequestStageKey = "delivery" | "review";

export interface RequestStage {
  key: RequestStageKey;
  label: string;
  role: "diseno" | "requester";
  gapDays: number;
  deadline: string | null;
  link: string | null;
  completedAt: string | null;
  status: "pending" | "done";
  decision?: "approved" | "changes_requested";
  late?: boolean;
  remind24hAt?: string;
  remind12hAt?: string;
  remind1hAt?: string;
  overdueLastRemindAt?: string;
}

export const REQUEST_STAGE_DEFS: { key: RequestStageKey; label: string; role: "diseno" | "requester"; gapDays: number }[] = [
  { key: "delivery", label: "Entrega de Diseño",         role: "diseno",     gapDays: 3 },
  { key: "review",   label: "Revisión del solicitante",  role: "requester", gapDays: 2 },
];

export function requestStageLabel(key: RequestStageKey | "completed"): string {
  if (key === "completed") return "Completado";
  return REQUEST_STAGE_DEFS.find(s => s.key === key)?.label ?? key;
}

export interface MarketingRequest {
  id: number;
  requesterEmail: string;
  // The dropdown category (reuses TODO_TASK_TYPES) — "title" is the display name: the category
  // itself, or the custom text typed in when taskType is "Otro".
  taskType: string;
  title: string;
  description: string;
  attachments: string[];
  // Other company emails explicitly invited to view/track this request — read-only, they don't
  // get approval rights (only the original requester does).
  sharedWithEmails: string[];
  assignedDisenoEmail: string | null;
  carolNotifiedAt: string | null;
  currentStage: RequestStageKey | "completed";
  status: "in_progress" | "completed";
  stages: RequestStage[];
  revisionRounds: number;
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

// All deadlines cut off at 6:30 PM Colombia time (fixed UTC-5, no DST).
export function deadlineTimestamp(dateIso: string): number {
  return new Date(`${dateIso}T18:30:00-05:00`).getTime();
}

export function isPastDeadline(dateIso: string): boolean {
  return Date.now() > deadlineTimestamp(dateIso);
}

export function todayIsoBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

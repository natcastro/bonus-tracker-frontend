import { formatDateHuman } from "./theme";
import { deadlineTimestamp } from "./types";
import type { MarketingStage } from "./types";

// When a stage was really delivered, in Colombia time. Newer stages store the exact moment; older ones
// are reconstructed from that day's "Diseño subió…"/"Laura…" notification.
const bogotaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
export const bogotaTimeFmt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
export function deliveredAt(s: MarketingStage, notifs: { createdAt: string; message: string }[]): { ts: Date; exact: boolean } | null {
  if (s.completedTs) return { ts: new Date(s.completedTs), exact: true };
  if (!s.completedAt) return null;
  const prefix = s.role === "diseno" ? "Diseño subió" : "Laura";
  const match = notifs.filter(n => n.message.startsWith(prefix) && bogotaDate(new Date(n.createdAt)) === s.completedAt).pop();
  return match ? { ts: new Date(match.createdAt), exact: false } : null;
}
export function lateExplanation(s: MarketingStage, notifs: { createdAt: string; message: string }[]): string {
  const at = deliveredAt(s, notifs);
  if (!at) return "No quedó guardada la hora exacta de esta entrega.";
  const when = `${bogotaTimeFmt.format(at.ts)} (hora Colombia)${at.exact ? "" : " — según la notificación de ese día"}`;
  if (!s.deadline) return `Entregado: ${when}.`;
  const limitMs = deadlineTimestamp(s.deadline);
  const diffMin = Math.round((at.ts.getTime() - limitMs) / 60000);
  const limit = `${formatDateHuman(s.deadline)}, 5:30 p. m.`;
  if (diffMin <= 0) return `Entregado: ${when}. Límite actual: ${limit}. Con el horario actual estaba a tiempo; se marcó tarde con un horario de corte anterior.`;
  const h = Math.floor(diffMin / 60), m = diffMin % 60;
  return `Entregado: ${when}. Límite: ${limit}. Pasó el límite por ${h > 0 ? `${h} h ` : ""}${m} min.`;
}


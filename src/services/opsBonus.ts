// Operations Team (Tomás) — bonus rules

export const OPS_APPEALS_BONUS: Record<string, number> = {
  fullRefund: 3.00,
  partialRefund: 1.50,
  fee: 0.25,
  lost: 0.00,
};

export const OPS_APPEALS_CAP = 200;
export const OPS_TOTAL_CAP = 300;

export function calcHandlingTimeBonus(hours: number): number {
  if (hours <= 30)   return 50;
  if (hours <= 32)   return 40;
  if (hours <= 34)   return 30;
  if (hours <= 36)   return 20;
  if (hours <= 38.5) return 10;
  return 0;
}

// ── Thomas' full-time bonus structure ───────────────────────────────────────
// Effective the first full cycle after his Sep 12, 2026 transition to full-time.
// The Sep 12–23, 2026 cycle itself is a transition period and still uses the
// hourly rules/caps above — see OperationsDashboard's isFullTimeCycle check.
export const FULLTIME_EFFECTIVE_CYCLE_START = "2026-09-24";

export const FULLTIME_APPEALS_CAP = 250;
export const FULLTIME_HANDLING_CAP = 40;
export const FULLTIME_TIKTOK_CAP = 50;
export const FULLTIME_AMAZON_PERF_CAP = 30;
export const FULLTIME_TOTAL_CAP = 370;

export const AMAZON_PERFORMANCE_BONUS: Record<string, number> = {
  good: 30,
  regular: 5,
  poor: 0,
};

// ── Amazon Performance as a graded quiz ───────────────────────────────────────────────────────────
// Instead of one Good / Regular / Poor pick, whoever reviews grades each area of the work; every area has a weight and
// the bonus is that share of the $30 cap. The A2C area is calculated from how many arrived vs. how many were answered.
export interface AmazonQuiz {
  a2cReceived: number | null;
  a2cAnswered: number | null;
  a2cAffected: number | null; // A2Cs that hurt the account or took money (information for the reviewer; Amazon-covered ones don't count)
  scores: Record<string, number | null>; // area key -> 0 | 25 | 50 | 75 | 100
  notes: string;
}

export const AMAZON_QUIZ_STEPS = [0, 25, 50, 75, 100];
export const AMAZON_QUIZ_CRITERIA: { key: string; label: string; weight: number; hint: string; auto?: boolean }[] = [
  { key: "a2c",        label: "A2Cs respondidos",                    weight: 25, auto: true, hint: "Se calcula solo: A2Cs respondidos entre A2Cs recibidos." },
  { key: "messages",   label: "Mensajes (tiempo de respuesta)",       weight: 15, hint: "¿Respondió los mensajes de clientes pronto?" },
  { key: "calls",      label: "Llamadas",                             weight: 10, hint: "¿Contestó las llamadas a tiempo?" },
  { key: "returns",    label: "Devoluciones",                         weight: 15, hint: "¿Atendió las devoluciones pronto y bien?" },
  { key: "appeals",    label: "Apelaciones",                          weight: 15, hint: "¿Hizo las apelaciones que se podían apelar, y a tiempo?" },
  { key: "efficiency", label: "Eficiencia y efectividad",             weight: 20, hint: "En general: ¿fue eficiente y efectivo? ¿Hubo negligencia?" },
];
export const EMPTY_AMAZON_QUIZ: AmazonQuiz = { a2cReceived: null, a2cAnswered: null, a2cAffected: null, scores: {}, notes: "" };

// 100 when nothing arrived; otherwise answered / received, capped at 100. null while the counts are missing.
export function amazonA2cScore(q: AmazonQuiz): number | null {
  if (q.a2cReceived === null || q.a2cReceived === undefined) return null;
  if (q.a2cReceived <= 0) return 100;
  if (q.a2cAnswered === null || q.a2cAnswered === undefined) return null;
  return Math.min(100, Math.round((q.a2cAnswered / q.a2cReceived) * 100));
}
export function amazonCriterionScore(q: AmazonQuiz, key: string): number | null {
  return key === "a2c" ? amazonA2cScore(q) : (q.scores?.[key] ?? null);
}
export function amazonQuizPct(q: AmazonQuiz): number {
  return Math.round(AMAZON_QUIZ_CRITERIA.reduce((s, c) => s + (c.weight * (amazonCriterionScore(q, c.key) ?? 0)) / 100, 0) * 100) / 100;
}
export const amazonQuizBonus = (pct: number): number => Math.round(FULLTIME_AMAZON_PERF_CAP * pct) / 100;
export function amazonGradedCount(q: AmazonQuiz): number {
  return AMAZON_QUIZ_CRITERIA.filter(c => amazonCriterionScore(q, c.key) !== null).length;
}
export const ratingFromPct = (pct: number): "good" | "regular" | "poor" => (pct >= 70 ? "good" : pct >= 30 ? "regular" : "poor");
// Older records only have the Good / Regular / Poor pick; newer ones carry the quiz score.
export function amazonPerfBonus(p: { rating: string; scorePct?: number | null }): number {
  return p.scorePct !== null && p.scorePct !== undefined ? amazonQuizBonus(p.scorePct) : (AMAZON_PERFORMANCE_BONUS[p.rating] ?? 0);
}

// Same hour brackets as the hourly structure, scaled to the new $40 cap (0.8x of $50).
export function calcHandlingTimeBonusFullTime(hours: number): number {
  if (hours <= 30)   return 40;
  if (hours <= 32)   return 32;
  if (hours <= 34)   return 24;
  if (hours <= 36)   return 16;
  if (hours <= 38.5) return 8;
  return 0;
}

// Full-time TikTok account score → value for a full cycle (max $50), prorated by days like the hourly scale.
export function tiktokCycleValueFullTime(score: number): number {
  if (score <= 3.9) return 0;
  if (score <= 4.0) return 20;
  if (score <= 4.4) return 30;
  if (score <= 4.5) return 40;
  return 50;
}

export function calcTikTokBonusFullTime(scores: { score: number; duration: number }[], daysInCycle: number): number {
  return scores.reduce((t, e) => t + (tiktokCycleValueFullTime(e.score) / daysInCycle) * e.duration, 0);
}

// ── TikTok score: manual entries + automatic daily Shop Performance Score ────
const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

// Manual entries always win. Days inside [from, to] that no manual entry covers but that have an
// automatic daily score are turned into runs of consecutive equal scores (negative ids = automatic).
export function mergeTikTokEntries(
  manual: { id: number; date: string; score: number; duration: number; year: number; cycleId: string }[],
  daily: { day: string; score: number }[],
  from: string, to: string, year: number, cycleId: string,
) {
  const covered = new Set<string>();
  manual.forEach((m) => { for (let i = 0; i < m.duration; i++) covered.add(addDays(m.date, i)); });
  const days = daily.filter((d) => d.day >= from && d.day <= to && !covered.has(d.day)).sort((a, b) => a.day.localeCompare(b.day));
  const auto: typeof manual = [];
  for (const d of days) {
    const last = auto[auto.length - 1];
    if (last && last.score === d.score && addDays(last.date, last.duration) === d.day) last.duration += 1;
    else auto.push({ id: -(auto.length + 1), date: d.day, score: d.score, duration: 1, year, cycleId });
  }
  return [...manual, ...auto];
}

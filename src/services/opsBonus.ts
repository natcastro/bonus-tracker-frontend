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

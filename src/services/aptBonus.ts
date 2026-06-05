// Account Protection Team (Juan) — bonus rules

export const APT_TOTAL_CAP = 300;

export const APT_A2Z_BONUS = 5.00;

export const APT_SAFETY_BONUS: Record<string, number> = {
  fullRecovery: 3.00,
  partialRecovery: 1.50,
  fees: 0.25,
  lost: 0.00,
};

export const APT_FEEDBACK_BONUS = 0.50;

export const APT_ACCOUNT_HEALTH_BONUS = 5.00;

export const APT_TIKTOK_HEALTH_BONUS: Record<string, number> = {
  non_buyer_fault: 2.00,
  defective_item: 2.00,
};

export const APT_PERFORMANCE_BONUS: Record<string, number> = {
  deficient: 0,
  minimum: 10,
  acceptable: 20,
  good: 30,
  very_good: 40,
  excellent: 50,
};

export const APT_PERFORMANCE_LABELS: Record<string, string> = {
  deficient: "Deficiente — $0",
  minimum: "Mínimo — $10",
  acceptable: "Aceptable — $20",
  good: "Bueno — $30",
  very_good: "Muy bueno — $40",
  excellent: "Excelente — $50",
};

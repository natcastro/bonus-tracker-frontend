// Account Protection Team (Juan) — bonus rules

export const APT_TOTAL_CAP = 300;

export const APT_A2Z_BONUS: Record<string, number> = {
  fullRecovery:    5.00,
  partialRecovery: 2.00,
  fees:            0.25,
  lost:            0.00,
};

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

export const CLAIM_TYPE_LABELS: Record<string, string> = {
  a2z: "A2Z Claim",
  safety: "Safety Claim",
  feedback: "Feedback Removed",
  account_health: "Account Health",
  tiktok_health: "TikTok Health",
};

export const CLAIM_SUB_TYPES: Record<string, { value: string; label: string }[]> = {
  a2z: [
    { value: "fullRecovery",    label: "Full Recovery ($5.00)" },
    { value: "partialRecovery", label: "Partial Recovery ($2.00)" },
    { value: "fees",            label: "Fees Only ($0.25)" },
    { value: "lost",            label: "Lost ($0.00)" },
  ],
  safety: [
    { value: "fullRecovery",    label: "Full Recovery ($3.00)" },
    { value: "partialRecovery", label: "Partial Recovery ($1.50)" },
    { value: "fees",            label: "Fees Only ($0.25)" },
    { value: "lost",            label: "Lost ($0.00)" },
  ],
  feedback: [
    { value: "Amazon", label: "Amazon ($0.50)" },
    { value: "TikTok", label: "TikTok ($0.50)" },
  ],
  account_health: [
    { value: "penalty",       label: "Penalty Removed ($5.00)" },
    { value: "violation",     label: "Violation Removed ($5.00)" },
    { value: "health_appeal", label: "Health Appeal Won ($5.00)" },
  ],
  tiktok_health: [
    { value: "non_buyer_fault", label: "Non-Buyer Fault Rate ($2.00)" },
    { value: "defective_item",  label: "Defective Item Rate ($2.00)" },
  ],
};

export function calcAptClaimBonus(claimType: string, subType: string): number {
  switch (claimType) {
    case "a2z":            return APT_A2Z_BONUS[subType] ?? 0;
    case "safety":         return APT_SAFETY_BONUS[subType] ?? 0;
    case "feedback":       return APT_FEEDBACK_BONUS;
    case "account_health": return APT_ACCOUNT_HEALTH_BONUS;
    case "tiktok_health":  return APT_TIKTOK_HEALTH_BONUS[subType] ?? 0;
    default:               return 0;
  }
}

export const APT_PERFORMANCE_LABELS: Record<string, string> = {
  deficient: "Deficiente — $0",
  minimum: "Mínimo — $10",
  acceptable: "Aceptable — $20",
  good: "Bueno — $30",
  very_good: "Muy bueno — $40",
  excellent: "Excelente — $50",
};

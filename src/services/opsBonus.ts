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

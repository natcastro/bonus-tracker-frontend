export const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

export const ATTENDANCE_BONUS: Record<string, number> = {
  full: 1000,
  absent: 0,
  // legacy keys (kept for existing DB records)
  none: 1500,
  justified: 0,
  multiple: 0,
};

export function calcGoalBonus(goalAmount: number, actualAmount: number): number {
  if (goalAmount <= 0) return 0;
  const pct = (actualAmount / goalAmount) * 100;
  if (pct >= 140) return 1500;
  if (pct >= 100) return 1000;
  return 0;
}

export function calcLiveSaleBonus(salesAmount: number): number {
  if (salesAmount >= 50000) return 500;
  if (salesAmount >= 35000) return 350;
  if (salesAmount >= 20000) return 200;
  if (salesAmount >= 10000) return 100;
  if (salesAmount >= 5000) return 70;
  if (salesAmount >= 3000) return 50;
  return 0;
}

export const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export const ATTENDANCE_BONUS: Record<string, number> = {
  none: 500,
  justified: 200,
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
  if (salesAmount >= 35000) return 750;
  if (salesAmount >= 20000) return 450;
  if (salesAmount >= 10000) return 220;
  if (salesAmount >= 5000) return 100;
  if (salesAmount >= 3000) return 50;
  return 0;
}

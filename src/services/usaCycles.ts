import type { Cycle } from "../types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Given a date string, return which cycle and year it belongs to
export function getCycleFromDate(dateStr: string): { year: number; cycleId: string } {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1; // 0-indexed
  const day = parseInt(dayStr);

  if (day >= 24) {
    const cycleMonth = (month + 1) % 12;
    const cycleYear = month === 11 ? year + 1 : year;
    return { year: cycleYear, cycleId: String(cycleMonth) };
  } else {
    return { year, cycleId: String(month) };
  }
}

export function getCurrentCycleDefault(): { year: string; cycleId: string } {
  const today = new Date();
  const month = today.getMonth(); // 0-indexed
  const day = today.getDate();
  const year = today.getFullYear();

  if (day >= 24) {
    // 24th onward → we're in next month's cycle
    const cycleMonth = (month + 1) % 12;
    const cycleYear = month === 11 ? year + 1 : year;
    return { year: String(cycleYear), cycleId: String(cycleMonth) };
  } else {
    // 1st–23rd → we're in current month's cycle
    return { year: String(year), cycleId: String(month) };
  }
}

// Each cycle: 24th of prev month → 23rd of current month
// e.g. cycle 0 = Dec 24 – Jan 23, cycle 1 = Jan 24 – Feb 23, ...
export function getCyclesForYear(year: number): Cycle[] {
  const cycles: Cycle[] = [];
  for (let i = 0; i < 12; i++) {
    const prevMonthIndex = i === 0 ? 11 : i - 1;
    const prevYear = i === 0 ? year - 1 : year;
    // Days in cycle = days in the previous month (24th through end + 1st–23rd)
    const daysInPrevMonth = new Date(prevYear, prevMonthIndex + 1, 0).getDate();
    cycles.push({
      id: `${i}`,
      name: `${MONTHS[prevMonthIndex]} 24 – ${MONTHS[i]} 23`,
      days: daysInPrevMonth,
    });
  }
  return cycles;
}

export const APPEALS_BONUS: Record<string, number> = {
  fullRefund: 4.0,
  partialRefund: 2.0,
  fee: 0.5,
  lost: 0.0,
};

export const AMAZON_BONUS: Record<string, number> = {
  good: 50.0,
  minor: 15.0,
  bad: 0.0,
};

export const CS_BONUS: Record<string, number> = {
  "0": 50.0,
  "1": 25.0,
  "2": 0.0,
};

export function calcTikTokBonus(scores: { score: number; duration: number }[], daysInCycle: number): number {
  return scores.reduce((total, entry) => {
    const s = entry.score;
    let monthlyVal = 0;
    if (s <= 3.9) monthlyVal = 0;
    else if (s <= 4.0) monthlyVal = 20;
    else if (s <= 4.4) monthlyVal = 30;
    else if (s <= 4.6) monthlyVal = 60;
    else if (s <= 4.7) monthlyVal = 70;
    else if (s <= 4.8) monthlyVal = 80;
    else monthlyVal = 100;
    return total + (monthlyVal / daysInCycle) * entry.duration;
  }, 0);
}

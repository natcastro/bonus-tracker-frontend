import type { Agent } from "../types";

// An agent is listed for a period if they had not left before it started
// (periodStartIso = first day of the month/cycle being viewed).
export const isAgentActiveFor = (a: Agent, periodStartIso: string): boolean => !a.activeUntil || a.activeUntil >= periodStartIso;

export const monthStartIso = (year: number | string, month1to12: number): string => `${year}-${String(month1to12).padStart(2, "0")}-01`;

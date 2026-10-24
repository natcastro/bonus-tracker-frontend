import type * as XLSXType from "xlsx";
import type { Agent, OpsAppeal, OpsAmazonPerformance, OpsHandlingTime, OpsTikTokScore } from "../types";

export interface OpsExportData {
  cycleName: string;                 // e.g. "Sep 24 – Oct 23"
  year: string;
  agents: Agent[];                   // every agent (so past cycles keep names)
  appeals: OpsAppeal[];
  handlingTimes: OpsHandlingTime[];
  tiktokScores: (OpsTikTokScore & { auto?: boolean })[];
  amazonPerformance: OpsAmazonPerformance[];
  totals: { agentName: string; appeals: number; appealsCap: number; handling: number; amazon: number; tiktok: number; total: number; totalCap: number }[];
  appealBonus: Record<string, number>;
  outcomeLabels: Record<string, string>;
  appealTypeLabel: (t: string | undefined) => string;
  handlingBonus: (agentId: number, hours: number) => number;
  amazonBonus: (p: OpsAmazonPerformance) => number;
  tiktokEarned: (score: number, duration: number) => { tier: number; earned: number };
}

const STATUS_LABELS: Record<string, string> = { pending: "Pending", inProgress: "In progress", completed: "Completed" };

// One sheet per kind of data Thomas enters, plus a summary of the resulting bonus.
export function buildOpsWorkbook(XLSX: typeof XLSXType, d: OpsExportData) {
  const name = (id: number) => d.agents.find(a => a.id === id)?.name ?? `Agent ${id}`;
  const wb = XLSX.utils.book_new();
  const add = (title: string, rows: Record<string, string | number>[], widths: number[]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "No data for this cycle" }]);
    ws["!cols"] = widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, title);
  };

  add("Summary", d.totals.map(t => ({
    Agent: t.agentName, "Appeals ($)": t.appeals, "Appeals cap ($)": t.appealsCap, "Handling time ($)": t.handling,
    "Amazon performance ($)": t.amazon, "TikTok score ($)": t.tiktok, "Total ($)": t.total, "Total cap ($)": t.totalCap,
  })), [18, 14, 16, 18, 22, 16, 12, 14]);

  add("Appeals", [...d.appeals].sort((a, b) => a.date.localeCompare(b.date)).map(a => {
    const counts = a.status === "completed" && !a.invalidated;
    return {
      Date: a.date, Agent: name(a.agentId), "Order number": a.orderNumber, Type: d.appealTypeLabel(a.appealType),
      Status: STATUS_LABELS[a.status] ?? a.status, Outcome: a.status === "completed" ? (d.outcomeLabels[a.outcome] ?? a.outcome) : "",
      "Bonus ($)": counts ? (d.appealBonus[a.outcome] ?? 0) : 0, "Counts toward bonus": counts ? "Yes" : "No",
      Invalidated: a.invalidated ? "Yes" : "No", "Invalidation note": a.invalidationNote ?? "",
    };
  }), [12, 16, 22, 18, 13, 16, 10, 18, 12, 40]);

  add("Handling time", d.handlingTimes.map(h => ({ Agent: name(h.agentId), Hours: h.hours, "Bonus ($)": d.handlingBonus(h.agentId, h.hours) })), [18, 10, 10]);

  add("TikTok score", [...d.tiktokScores].sort((a, b) => a.date.localeCompare(b.date)).map(t => {
    const { tier, earned } = d.tiktokEarned(t.score, t.duration);
    return {
      "Start date": t.date, Days: t.duration, Score: t.score, Source: t.auto ? "Automatic (TikTok Shop)" : "Manual entry",
      "Value for a full cycle ($)": Math.round(tier * 100) / 100, "Earned ($)": Math.round(earned * 100) / 100,
    };
  }), [12, 8, 8, 24, 24, 12]);

  add("Amazon performance", d.amazonPerformance.map(p => ({ Agent: name(p.agentId), Rating: p.rating, "Score (%)": p.scorePct ?? "", "Bonus ($)": d.amazonBonus(p) })), [18, 12, 10, 10]);

  return wb;
}

export const opsExportFileName = (cycleName: string, year: string) =>
  `Operations ${cycleName.replace(/[–—]/g, "-").replace(/\s+/g, " ")} ${year}.xlsx`;

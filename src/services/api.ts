import { supabase } from "./supabase";
import type {
  Agent, Appeal, UsaPeriodData, TikTokScore, UsaLiveSchedule,
  MexAttendance, MexAgentGoal, MexAttendanceDay, MexLiveSale, MexMonthlyGoal, MexScheduleEvent,
  OpsAppeal, OpsHandlingTime, OpsTikTokScore,
  AptClaim,
  AptA2zClaim, AptSafetyClaim, AptFeedback,
  AptAccountHealth, AptTikTokHealth, AptPerformance,
  CSQualityCase, CSQualityPhoto,
  StrategyEntry, StrategySample, SampleCatalogItem, StrategyIncident, LogisticsOrder,
  UploadBatch, UploadRow, AffiliateContestEntry, SampleAnalysisPeriod, SampleAnalysisRow,
} from "../types";
import type { MarketingBrief, MarketingNotification } from "../pages/marketing/types";

const USA_PASSWORD = "usa2026";
const MEX_PASSWORD = "mex2026";
const MEX_STAFF_PASSWORD = "FAJA";
const OPS_PASSWORD = "ops2026";
const APT_PASSWORD = "maria2026";
const TKLIVES_PASSWORD = "usa2026";
const LOGISTICS_PASSWORD = "Fajas2026!";

// ── Auth ─────────────────────────────────────────────────────────────────────

// Returns "admin" | "staff" for MEX, "admin" for others
export async function verifyPassword(team: string, password: string): Promise<"admin" | "staff"> {
  if (team.toUpperCase() === "MEX") {
    if (password === MEX_PASSWORD) return "admin";
    if (password === MEX_STAFF_PASSWORD) return "staff";
    throw new Error("Incorrect password.");
  }
  const map: Record<string, string> = {
    USA: USA_PASSWORD, OPS: OPS_PASSWORD, APT: APT_PASSWORD, TKLIVES: TKLIVES_PASSWORD, LOGISTICS: LOGISTICS_PASSWORD,
  };
  const expected = map[team.toUpperCase()];
  if (!expected || password !== expected) throw new Error("Incorrect password.");
  return "admin";
}

// Super-admin check: team password + "!" (e.g. "usa2026!")
export function verifySuperAdmin(team: string, password: string): boolean {
  const map: Record<string, string> = {
    USA: USA_PASSWORD, OPS: OPS_PASSWORD, APT: APT_PASSWORD,
  };
  const base = map[team.toUpperCase()];
  return !!base && password === base + "!";
}

// ── Agents ───────────────────────────────────────────────────────────────────

export async function getAgents(team: string): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("team", team.toUpperCase())
    .order("id");
  if (error) throw error;
  return data as Agent[];
}

export async function updateAgentName(id: number, name: string): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .update({ name })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Agent;
}

export async function createAgent(name: string, team: string): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .insert({ name, team: team.toUpperCase() })
    .select()
    .single();
  if (error) throw error;
  return data as Agent;
}

export async function updateAgentTimezone(id: number, timezone: string): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .update({ timezone })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Agent;
}

export async function deleteAgent(id: number): Promise<void> {
  const { error } = await supabase.from("agents").delete().eq("id", id);
  if (error) throw error;
}

// ── USA: Appeals ─────────────────────────────────────────────────────────────

export async function getAppeals(year: number, cycleId: string): Promise<Appeal[]> {
  const { data, error } = await supabase
    .from("appeals")
    .select("*, agent:agents(id, name, team)")
    .eq("year", year)
    .eq("cycle_id", cycleId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAppeal);
}

export async function addAppeal(appeal: Omit<Appeal, "id" | "agent">): Promise<Appeal> {
  const { data, error } = await supabase
    .from("appeals")
    .insert({
      agent_id: appeal.agentId,
      date: appeal.date,
      order_number: appeal.orderNumber,
      platform: appeal.platform,
      status: appeal.status,
      outcome: appeal.outcome,
      year: appeal.year,
      cycle_id: appeal.cycleId,
    })
    .select()
    .single();
  if (error) throw error;
  return mapAppeal(data);
}

export async function updateAppeal(id: number, appeal: Partial<Appeal>): Promise<Appeal> {
  const { data, error } = await supabase
    .from("appeals")
    .update({
      agent_id: appeal.agentId,
      date: appeal.date,
      order_number: appeal.orderNumber,
      platform: appeal.platform,
      status: appeal.status,
      outcome: appeal.outcome,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapAppeal(data);
}

export async function deleteAppeal(id: number): Promise<void> {
  const { error } = await supabase.from("appeals").delete().eq("id", id);
  if (error) throw error;
}

// ── USA: Period data ──────────────────────────────────────────────────────────

export async function getPeriodData(year: number, cycleId: string): Promise<UsaPeriodData[]> {
  const { data, error } = await supabase
    .from("usa_period_data")
    .select("*")
    .eq("year", year)
    .eq("cycle_id", cycleId);
  if (error) throw error;
  return (data ?? []).map(mapPeriod);
}

export async function upsertPeriodData(d: Omit<UsaPeriodData, "id" | "agent">): Promise<void> {
  const { error } = await supabase
    .from("usa_period_data")
    .upsert(
      { agent_id: d.agentId, year: d.year, cycle_id: d.cycleId, amazon_health: d.amazonHealth, cs_quality: d.csQuality },
      { onConflict: "agent_id,year,cycle_id" }
    );
  if (error) throw error;
}

// ── USA: TikTok ───────────────────────────────────────────────────────────────

export async function getTikTokScores(year: number, cycleId: string): Promise<TikTokScore[]> {
  const { data, error } = await supabase
    .from("tiktok_scores")
    .select("*")
    .eq("year", year)
    .eq("cycle_id", cycleId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTikTok);
}

export async function addTikTokScore(score: Omit<TikTokScore, "id">): Promise<TikTokScore> {
  const { data, error } = await supabase
    .from("tiktok_scores")
    .insert({ date: score.date, score: score.score, duration: score.duration, year: score.year, cycle_id: score.cycleId })
    .select()
    .single();
  if (error) throw error;
  return mapTikTok(data);
}

export async function deleteTikTokScore(id: number): Promise<void> {
  const { error } = await supabase.from("tiktok_scores").delete().eq("id", id);
  if (error) throw error;
}

// ── Mexico: Attendance ────────────────────────────────────────────────────────

export async function getMexAttendance(year: number, month: number): Promise<MexAttendance[]> {
  const { data, error } = await supabase
    .from("mex_attendance")
    .select("*, agent:agents(id, name, team)")
    .eq("year", year)
    .eq("month", month);
  if (error) throw error;
  return (data ?? []).map(mapMexAttendance);
}

export async function upsertMexAttendance(d: Omit<MexAttendance, "id" | "agent">): Promise<void> {
  const { error } = await supabase
    .from("mex_attendance")
    .upsert(
      { agent_id: d.agentId, year: d.year, month: d.month, status: d.status },
      { onConflict: "agent_id,year,month" }
    );
  if (error) throw error;
}

// ── Mexico: Live sales ────────────────────────────────────────────────────────

export async function getMexSales(year: number, month: number): Promise<MexLiveSale[]> {
  const { data, error } = await supabase
    .from("mex_live_sales")
    .select("*, agent:agents(id, name, team)")
    .eq("year", year)
    .eq("month", month)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapMexSale);
}

export async function addMexSale(sale: Omit<MexLiveSale, "id" | "agent">): Promise<MexLiveSale> {
  const { data, error } = await supabase
    .from("mex_live_sales")
    .insert({
      agent_id: sale.agentId,
      date: sale.date,
      sales_amount: sale.salesAmount,
      quantity: sale.quantity,
      skus: sale.skus,
      year: sale.year,
      month: sale.month,
      status: sale.status ?? "approved",
    })
    .select()
    .single();
  if (error) throw error;
  return mapMexSale(data);
}

export async function deleteMexSale(id: number): Promise<void> {
  const { error } = await supabase.from("mex_live_sales").delete().eq("id", id);
  if (error) throw error;
}

export async function updateMexSale(id: number, fields: { salesAmount: number; quantity: number; skus: string }): Promise<void> {
  const { error } = await supabase.from("mex_live_sales").update({ sales_amount: fields.salesAmount, quantity: fields.quantity, skus: fields.skus }).eq("id", id);
  if (error) throw error;
}

export async function approveMexSale(id: number): Promise<void> {
  const { error } = await supabase.from("mex_live_sales").update({ status: "approved" }).eq("id", id);
  if (error) throw error;
}

export async function rejectMexSale(id: number): Promise<void> {
  const { error } = await supabase.from("mex_live_sales").delete().eq("id", id);
  if (error) throw error;
}

// ── Mexico: Monthly goal ──────────────────────────────────────────────────────

export async function getMexGoal(year: number, month: number): Promise<MexMonthlyGoal | null> {
  const { data, error } = await supabase
    .from("mex_monthly_goals")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMexGoal(data) : null;
}

export async function upsertMexGoal(g: Omit<MexMonthlyGoal, "id">): Promise<void> {
  const { error } = await supabase
    .from("mex_monthly_goals")
    .upsert(
      { year: g.year, month: g.month, goal_amount: g.goalAmount, actual_amount: g.actualAmount },
      { onConflict: "year,month" }
    );
  if (error) throw error;
}

// ── Mexico: Per-agent Goals ───────────────────────────────────────────────────

function mapMexAgentGoal(r: any): MexAgentGoal {
  return { id: r.id, agentId: r.agent_id, year: r.year, month: r.month, goalAmount: Number(r.goal_amount) };
}

export async function getMexAgentGoals(year: number, month: number): Promise<MexAgentGoal[]> {
  const { data, error } = await supabase
    .from("mex_agent_goals")
    .select("*")
    .eq("year", year).eq("month", month);
  if (error) throw error;
  return (data ?? []).map(mapMexAgentGoal);
}

export async function upsertMexAgentGoal(g: Omit<MexAgentGoal, "id">): Promise<void> {
  const { error } = await supabase
    .from("mex_agent_goals")
    .upsert(
      { agent_id: g.agentId, year: g.year, month: g.month, goal_amount: g.goalAmount },
      { onConflict: "agent_id,year,month" }
    );
  if (error) throw error;
}

// ── Mexico: Attendance Days ───────────────────────────────────────────────────

export async function getMexAttendanceDays(year: number, month: number): Promise<MexAttendanceDay[]> {
  const { data, error } = await supabase
    .from("mex_attendance_days")
    .select("*")
    .eq("year", year).eq("month", month)
    .order("date");
  if (error) throw error;
  return (data ?? []).map(mapMexAttendanceDay);
}

export async function upsertMexAttendanceDay(d: Omit<MexAttendanceDay, "id">): Promise<void> {
  const { error } = await supabase.from("mex_attendance_days")
    .upsert({ agent_id: d.agentId, date: d.date, status: d.status, note: d.note, year: d.year, month: d.month }, { onConflict: "agent_id,date" });
  if (error) throw error;
}

export async function deleteMexAttendanceDay(id: number): Promise<void> {
  const { error } = await supabase.from("mex_attendance_days").delete().eq("id", id);
  if (error) throw error;
}

// ── Mexico: Schedule Events ───────────────────────────────────────────────────

export async function getMexScheduleEvents(year: number, month: number): Promise<MexScheduleEvent[]> {
  const { data, error } = await supabase
    .from("mex_schedule_events")
    .select("*")
    .eq("year", year).eq("month", month)
    .order("date");
  if (error) throw error;
  return (data ?? []).map(mapMexScheduleEvent);
}

export async function addMexScheduleEvent(e: Omit<MexScheduleEvent, "id">): Promise<void> {
  const { error } = await supabase.from("mex_schedule_events")
    .insert({ agent_id: e.agentId, date: e.date, start_time: e.startTime, end_time: e.endTime, note: e.note, year: e.year, month: e.month });
  if (error) throw error;
}

export async function deleteMexScheduleEvent(id: number): Promise<void> {
  const { error } = await supabase.from("mex_schedule_events").delete().eq("id", id);
  if (error) throw error;
}

// ── Operations: Appeals ───────────────────────────────────────────────────────

export async function getOpsAppeals(year: number, cycleId: string): Promise<OpsAppeal[]> {
  const { data, error } = await supabase
    .from("ops_appeals")
    .select("*, agent:agents(id, name, team)")
    .eq("year", year).eq("cycle_id", cycleId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOpsAppeal);
}

export async function addOpsAppeal(a: Omit<OpsAppeal, "id" | "agent">): Promise<OpsAppeal> {
  const { data, error } = await supabase.from("ops_appeals")
    .insert({ agent_id: a.agentId, date: a.date, order_number: a.orderNumber, appeal_type: a.appealType ?? "tiktok", status: a.status, outcome: a.outcome, year: a.year, cycle_id: a.cycleId })
    .select().single();
  if (error) throw error;
  return mapOpsAppeal(data);
}

export async function updateOpsAppeal(id: number, a: Partial<OpsAppeal>): Promise<OpsAppeal> {
  const { data, error } = await supabase.from("ops_appeals")
    .update({ agent_id: a.agentId, date: a.date, order_number: a.orderNumber, appeal_type: a.appealType, status: a.status, outcome: a.outcome })
    .eq("id", id).select().single();
  if (error) throw error;
  return mapOpsAppeal(data);
}

export async function deleteOpsAppeal(id: number): Promise<void> {
  const { error } = await supabase.from("ops_appeals").delete().eq("id", id);
  if (error) throw error;
}

// ── Operations: Handling Time ─────────────────────────────────────────────────

export async function getOpsHandlingTime(year: number, cycleId: string): Promise<OpsHandlingTime[]> {
  const { data, error } = await supabase
    .from("ops_handling_time").select("*").eq("year", year).eq("cycle_id", cycleId);
  if (error) throw error;
  return (data ?? []).map(mapOpsHandlingTime);
}

export async function upsertOpsHandlingTime(d: Omit<OpsHandlingTime, "id">): Promise<void> {
  const { error } = await supabase.from("ops_handling_time")
    .upsert({ agent_id: d.agentId, year: d.year, cycle_id: d.cycleId, hours: d.hours }, { onConflict: "agent_id,year,cycle_id" });
  if (error) throw error;
}

// ── Operations: TikTok Scores ─────────────────────────────────────────────────

export async function getOpsTikTokScores(year: number, cycleId: string): Promise<OpsTikTokScore[]> {
  const { data, error } = await supabase
    .from("ops_tiktok_scores").select("*").eq("year", year).eq("cycle_id", cycleId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOpsTikTokScore);
}

export async function addOpsTikTokScore(s: Omit<OpsTikTokScore, "id">): Promise<OpsTikTokScore> {
  const { data, error } = await supabase.from("ops_tiktok_scores")
    .insert({ date: s.date, score: s.score, duration: s.duration, year: s.year, cycle_id: s.cycleId })
    .select().single();
  if (error) throw error;
  return mapOpsTikTokScore(data);
}

export async function deleteOpsTikTokScore(id: number): Promise<void> {
  const { error } = await supabase.from("ops_tiktok_scores").delete().eq("id", id);
  if (error) throw error;
}

// ── Account Protection: Unified Claims ───────────────────────────────────────

export async function getAptClaims(year: number, cycleId: string): Promise<AptClaim[]> {
  const { data, error } = await supabase
    .from("apt_claims")
    .select("*, agent:agents(id, name, team)")
    .eq("year", year).eq("cycle_id", cycleId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAptClaim);
}

export async function addAptClaim(c: Omit<AptClaim, "id" | "agent">): Promise<AptClaim> {
  const { data, error } = await supabase.from("apt_claims")
    .insert({ agent_id: c.agentId, date: c.date, reference_number: c.referenceNumber, claim_type: c.claimType, sub_type: c.subType, status: c.status ?? "completed", year: c.year, cycle_id: c.cycleId })
    .select().single();
  if (error) throw error;
  return mapAptClaim(data);
}

export async function updateAptClaim(id: number, c: Partial<Omit<AptClaim, "id" | "agent">>): Promise<void> {
  const { error } = await supabase.from("apt_claims").update({
    agent_id: c.agentId, date: c.date, reference_number: c.referenceNumber,
    claim_type: c.claimType, sub_type: c.subType, status: c.status,
  }).eq("id", id);
  if (error) throw error;
}

export async function deleteAptClaim(id: number): Promise<void> {
  const { error } = await supabase.from("apt_claims").delete().eq("id", id);
  if (error) throw error;
}

// ── Account Protection: A2Z Claims ────────────────────────────────────────────

export async function getAptA2zClaims(year: number, cycleId: string): Promise<AptA2zClaim[]> {
  const { data, error } = await supabase
    .from("apt_a2z_claims").select("*, agent:agents(id, name, team)")
    .eq("year", year).eq("cycle_id", cycleId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAptA2zClaim);
}

export async function addAptA2zClaim(c: Omit<AptA2zClaim, "id" | "agent">): Promise<AptA2zClaim> {
  const { data, error } = await supabase.from("apt_a2z_claims")
    .insert({ agent_id: c.agentId, date: c.date, year: c.year, cycle_id: c.cycleId })
    .select().single();
  if (error) throw error;
  return mapAptA2zClaim(data);
}

export async function deleteAptA2zClaim(id: number): Promise<void> {
  const { error } = await supabase.from("apt_a2z_claims").delete().eq("id", id);
  if (error) throw error;
}

// ── Account Protection: Safety Claims ────────────────────────────────────────

export async function getAptSafetyClaims(year: number, cycleId: string): Promise<AptSafetyClaim[]> {
  const { data, error } = await supabase
    .from("apt_safety_claims").select("*, agent:agents(id, name, team)")
    .eq("year", year).eq("cycle_id", cycleId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAptSafetyClaim);
}

export async function addAptSafetyClaim(c: Omit<AptSafetyClaim, "id" | "agent">): Promise<AptSafetyClaim> {
  const { data, error } = await supabase.from("apt_safety_claims")
    .insert({ agent_id: c.agentId, date: c.date, outcome: c.outcome, year: c.year, cycle_id: c.cycleId })
    .select().single();
  if (error) throw error;
  return mapAptSafetyClaim(data);
}

export async function deleteAptSafetyClaim(id: number): Promise<void> {
  const { error } = await supabase.from("apt_safety_claims").delete().eq("id", id);
  if (error) throw error;
}

// ── Account Protection: Feedbacks ─────────────────────────────────────────────

export async function getAptFeedbacks(year: number, cycleId: string): Promise<AptFeedback[]> {
  const { data, error } = await supabase
    .from("apt_feedbacks").select("*, agent:agents(id, name, team)")
    .eq("year", year).eq("cycle_id", cycleId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAptFeedback);
}

export async function addAptFeedback(f: Omit<AptFeedback, "id" | "agent">): Promise<AptFeedback> {
  const { data, error } = await supabase.from("apt_feedbacks")
    .insert({ agent_id: f.agentId, date: f.date, platform: f.platform, year: f.year, cycle_id: f.cycleId })
    .select().single();
  if (error) throw error;
  return mapAptFeedback(data);
}

export async function deleteAptFeedback(id: number): Promise<void> {
  const { error } = await supabase.from("apt_feedbacks").delete().eq("id", id);
  if (error) throw error;
}

// ── Account Protection: Account Health ───────────────────────────────────────

export async function getAptAccountHealth(year: number, cycleId: string): Promise<AptAccountHealth[]> {
  const { data, error } = await supabase
    .from("apt_account_health").select("*, agent:agents(id, name, team)")
    .eq("year", year).eq("cycle_id", cycleId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAptAccountHealth);
}

export async function addAptAccountHealth(h: Omit<AptAccountHealth, "id" | "agent">): Promise<AptAccountHealth> {
  const { data, error } = await supabase.from("apt_account_health")
    .insert({ agent_id: h.agentId, date: h.date, type: h.type, year: h.year, cycle_id: h.cycleId })
    .select().single();
  if (error) throw error;
  return mapAptAccountHealth(data);
}

export async function deleteAptAccountHealth(id: number): Promise<void> {
  const { error } = await supabase.from("apt_account_health").delete().eq("id", id);
  if (error) throw error;
}

// ── Account Protection: TikTok Health ─────────────────────────────────────────

export async function getAptTikTokHealth(year: number, cycleId: string): Promise<AptTikTokHealth[]> {
  const { data, error } = await supabase
    .from("apt_tiktok_health").select("*, agent:agents(id, name, team)")
    .eq("year", year).eq("cycle_id", cycleId).order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAptTikTokHealth);
}

export async function addAptTikTokHealth(t: Omit<AptTikTokHealth, "id" | "agent">): Promise<AptTikTokHealth> {
  const { data, error } = await supabase.from("apt_tiktok_health")
    .insert({ agent_id: t.agentId, date: t.date, type: t.type, year: t.year, cycle_id: t.cycleId })
    .select().single();
  if (error) throw error;
  return mapAptTikTokHealth(data);
}

export async function deleteAptTikTokHealth(id: number): Promise<void> {
  const { error } = await supabase.from("apt_tiktok_health").delete().eq("id", id);
  if (error) throw error;
}

// ── Account Protection: Performance ───────────────────────────────────────────

export async function getAptPerformance(year: number, cycleId: string): Promise<AptPerformance[]> {
  const { data, error } = await supabase
    .from("apt_performance").select("*").eq("year", year).eq("cycle_id", cycleId);
  if (error) throw error;
  return (data ?? []).map(mapAptPerformance);
}

export async function upsertAptPerformance(p: Omit<AptPerformance, "id">): Promise<void> {
  const { error } = await supabase.from("apt_performance")
    .upsert({ agent_id: p.agentId, year: p.year, cycle_id: p.cycleId, level: p.level }, { onConflict: "agent_id,year,cycle_id" });
  if (error) throw error;
}

// ── Mappers (snake_case DB → camelCase TS) ────────────────────────────────────

function mapAppeal(r: any): Appeal {
  return {
    id: r.id,
    agentId: r.agent_id,
    agent: r.agent ?? undefined,
    date: r.date,
    orderNumber: r.order_number,
    platform: r.platform,
    status: r.status,
    outcome: r.outcome,
    year: r.year,
    cycleId: r.cycle_id,
  };
}

function mapPeriod(r: any): UsaPeriodData {
  return {
    id: r.id,
    agentId: r.agent_id,
    year: r.year,
    cycleId: r.cycle_id,
    amazonHealth: r.amazon_health,
    csQuality: r.cs_quality,
  };
}

function mapTikTok(r: any): TikTokScore {
  return { id: r.id, date: r.date, score: r.score, duration: r.duration, year: r.year, cycleId: r.cycle_id };
}

function mapMexAttendance(r: any): MexAttendance {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, year: r.year, month: r.month, status: r.status };
}

function mapMexSale(r: any): MexLiveSale {
  return {
    id: r.id,
    agentId: r.agent_id,
    agent: r.agent ?? undefined,
    date: r.date,
    salesAmount: r.sales_amount,
    quantity: r.quantity ?? 0,
    skus: r.skus ?? "",
    year: r.year,
    month: r.month,
    status: r.status ?? "approved",
  };
}

function mapMexGoal(r: any): MexMonthlyGoal {
  return { id: r.id, year: r.year, month: r.month, goalAmount: r.goal_amount, actualAmount: r.actual_amount };
}

function mapMexAttendanceDay(r: any): MexAttendanceDay {
  return { id: r.id, agentId: r.agent_id, date: r.date, status: r.status, note: r.note ?? "", year: r.year, month: r.month };
}

function mapMexScheduleEvent(r: any): MexScheduleEvent {
  return { id: r.id, agentId: r.agent_id, date: r.date, startTime: r.start_time, endTime: r.end_time, note: r.note ?? "", year: r.year, month: r.month };
}

function mapOpsAppeal(r: any): OpsAppeal {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, orderNumber: r.order_number, appealType: r.appeal_type ?? "tiktok", status: r.status, outcome: r.outcome, year: r.year, cycleId: r.cycle_id };
}

function mapOpsHandlingTime(r: any): OpsHandlingTime {
  return { id: r.id, agentId: r.agent_id, year: r.year, cycleId: r.cycle_id, hours: r.hours };
}

function mapOpsTikTokScore(r: any): OpsTikTokScore {
  return { id: r.id, date: r.date, score: r.score, duration: r.duration, year: r.year, cycleId: r.cycle_id };
}

function mapAptClaim(r: any): AptClaim {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, referenceNumber: r.reference_number, claimType: r.claim_type, subType: r.sub_type, status: r.status ?? "completed", year: r.year, cycleId: r.cycle_id };
}

function mapAptA2zClaim(r: any): AptA2zClaim {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, year: r.year, cycleId: r.cycle_id };
}

function mapAptSafetyClaim(r: any): AptSafetyClaim {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, outcome: r.outcome, year: r.year, cycleId: r.cycle_id };
}

function mapAptFeedback(r: any): AptFeedback {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, platform: r.platform, year: r.year, cycleId: r.cycle_id };
}

function mapAptAccountHealth(r: any): AptAccountHealth {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, type: r.type, year: r.year, cycleId: r.cycle_id };
}

function mapAptTikTokHealth(r: any): AptTikTokHealth {
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, type: r.type, year: r.year, cycleId: r.cycle_id };
}

function mapAptPerformance(r: any): AptPerformance {
  return { id: r.id, agentId: r.agent_id, year: r.year, cycleId: r.cycle_id, level: r.level };
}

// ── USA Live Schedules ────────────────────────────────────────────────────────

function mapUsaLiveSchedule(r: any): UsaLiveSchedule {
  return { id: r.id, agentId: r.agent_id, date: r.date, startTime: r.start_time, endTime: r.end_time, note: r.note ?? "", year: r.year, month: r.month };
}

export async function getUsaLiveSchedules(year: number, month: number): Promise<UsaLiveSchedule[]> {
  const { data, error } = await supabase.from("usa_live_schedules").select("*").eq("year", year).eq("month", month).order("date");
  if (error) throw error;
  return (data ?? []).map(mapUsaLiveSchedule);
}

export async function addUsaLiveSchedule(s: Omit<UsaLiveSchedule, "id">): Promise<void> {
  const { error } = await supabase.from("usa_live_schedules").insert({
    agent_id: s.agentId, date: s.date, start_time: s.startTime, end_time: s.endTime, note: s.note, year: s.year, month: s.month,
  });
  if (error) throw error;
}

export async function deleteUsaLiveSchedule(id: number): Promise<void> {
  const { error } = await supabase.from("usa_live_schedules").delete().eq("id", id);
  if (error) throw error;
}

// ── CS Quality Dictionary ─────────────────────────────────────────────────────

function mapCSPhoto(r: any): CSQualityPhoto {
  return { id: r.id, caseId: r.case_id, url: r.url, caption: r.caption ?? "" };
}

function mapCSCase(r: any): CSQualityCase {
  return {
    id: r.id, title: r.title, description: r.description ?? "",
    category: r.category ?? "", code: r.code ?? "",
    warrantyApplies: !!r.warranty_applies,
    status: r.status ?? "pending",
    createdAt: r.created_at ?? "",
    photos: (r.cs_quality_photos ?? []).map(mapCSPhoto),
  };
}

export async function getCSCases(status: "approved" | "pending" = "approved"): Promise<CSQualityCase[]> {
  const { data, error } = await supabase
    .from("cs_quality_cases")
    .select("*, cs_quality_photos(*)")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapCSCase);
}

export async function createCSCase(
  c: Pick<CSQualityCase, "title" | "description" | "category" | "warrantyApplies" | "code">,
  status: "pending" | "approved" = "pending"
): Promise<CSQualityCase> {
  const { data, error } = await supabase
    .from("cs_quality_cases")
    .insert({ title: c.title, description: c.description, category: c.category, warranty_applies: c.warrantyApplies, code: c.code, status })
    .select()
    .single();
  if (error) throw error;
  return { ...mapCSCase(data), photos: [] };
}

export async function approveCSCase(id: number, code: string): Promise<void> {
  const { error } = await supabase.from("cs_quality_cases").update({ status: "approved", code }).eq("id", id);
  if (error) throw error;
}

export async function rejectCSCase(id: number): Promise<void> {
  const { error } = await supabase.from("cs_quality_cases").delete().eq("id", id);
  if (error) throw error;
}

export async function updateCSCase(id: number, c: Partial<Pick<CSQualityCase, "title" | "description" | "category" | "warrantyApplies" | "code">>): Promise<void> {
  const upd: any = {};
  if (c.title !== undefined) upd.title = c.title;
  if (c.description !== undefined) upd.description = c.description;
  if (c.category !== undefined) upd.category = c.category;
  if (c.warrantyApplies !== undefined) upd.warranty_applies = c.warrantyApplies;
  if (c.code !== undefined) upd.code = c.code;
  const { error } = await supabase.from("cs_quality_cases").update(upd).eq("id", id);
  if (error) throw error;
}

export async function addCSPhoto(caseId: number, file: File, caption: string): Promise<CSQualityPhoto> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${caseId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("cs-quality-photos").upload(path, file);
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from("cs-quality-photos").getPublicUrl(path);
  const { data, error } = await supabase
    .from("cs_quality_photos")
    .insert({ case_id: caseId, url: urlData.publicUrl, caption })
    .select()
    .single();
  if (error) throw error;
  return mapCSPhoto(data);
}

export async function deleteCSPhoto(id: number): Promise<void> {
  const { error } = await supabase.from("cs_quality_photos").delete().eq("id", id);
  if (error) throw error;
}

// ── Strategy Team ──────────────────────────────────────────────────────────────

export async function getStrategyEntries(year: string, cycleId: string): Promise<StrategyEntry[]> {
  const { data, error } = await supabase
    .from("strategy_entries")
    .select("*")
    .eq("year", year)
    .eq("cycle_id", cycleId);
  if (error) throw error;
  return (data ?? []).map(mapStrategyEntry);
}

export async function upsertStrategyEntry(e: Omit<StrategyEntry, "id">): Promise<void> {
  const { error } = await supabase
    .from("strategy_entries")
    .upsert({
      agent_id: e.agentId,
      year: e.year,
      cycle_id: e.cycleId,
      roi_pct: e.roiPct,
      product_score: e.productScore,
      non_buyer_fault_rate: e.nonBuyerFaultRate,
      negative_review_rate: e.negativeReviewRate,
      operative_compliance_pct: e.operativeCompliancePct,
      operative_qa: e.operativeQa,
    }, { onConflict: "agent_id,year,cycle_id" });
  if (error) throw error;
}

function mapStrategyEntry(r: any): StrategyEntry {
  return {
    id: r.id,
    agentId: r.agent_id,
    year: r.year,
    cycleId: r.cycle_id,
    roiPct: r.roi_pct ?? 0,
    productScore: r.product_score ?? 0,
    nonBuyerFaultRate: r.non_buyer_fault_rate ?? 0,
    negativeReviewRate: r.negative_review_rate ?? 0,
    operativeCompliancePct: r.operative_compliance_pct ?? 0,
    operativeQa: r.operative_qa ?? {},
    bonusSamplesLocked: r.bonus_samples_locked ?? false,
    bonusSamplesLockedAt: r.bonus_samples_locked_at ?? undefined,
    bonusSamplesLockedAmount: r.bonus_samples_locked_amount ?? undefined,
  };
}

// ── Logistics ─────────────────────────────────────────────────────────────────

export async function getLogisticsOrders(): Promise<LogisticsOrder[]> {
  const { data, error } = await supabase
    .from("logistics_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id: r.id,
    storeId: r.store_id ?? 1,
    platform: (r.platform ?? "other") as LogisticsOrder["platform"],
    article: r.article,
    orderNumber: r.order_number,
    trackingNumber: r.tracking_number ?? undefined,
    labelUrl: r.label_url ?? undefined,
    status: r.status,
    shipDate: r.ship_date ?? undefined,
    createdAt: r.created_at,
    doneAt: r.done_at ?? undefined,
    notes: r.notes ?? undefined,
  }));
}

export async function createLogisticsOrder(o: Omit<LogisticsOrder, "id" | "createdAt" | "doneAt">): Promise<void> {
  const { error } = await supabase.from("logistics_orders").insert({
    store_id: o.storeId, platform: o.platform, article: o.article, order_number: o.orderNumber,
    tracking_number: o.trackingNumber ?? null,
    label_url: o.labelUrl ?? null, status: "pending",
    ship_date: o.shipDate ?? null, notes: o.notes ?? "",
  });
  if (error) throw new Error(error.message);
}

export async function markLogisticsOrderDone(id: number): Promise<void> {
  const { error } = await supabase.from("logistics_orders")
    .update({ status: "done", done_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markLogisticsOrderPending(id: number): Promise<void> {
  const { error } = await supabase.from("logistics_orders")
    .update({ status: "pending", done_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateLogisticsOrder(id: number, o: Partial<Pick<LogisticsOrder, "storeId"|"platform"|"article"|"orderNumber"|"trackingNumber"|"labelUrl"|"shipDate"|"notes">>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (o.storeId         !== undefined) patch.store_id        = o.storeId;
  if (o.platform        !== undefined) patch.platform        = o.platform;
  if (o.article         !== undefined) patch.article         = o.article;
  if (o.orderNumber     !== undefined) patch.order_number    = o.orderNumber;
  if (o.trackingNumber  !== undefined) patch.tracking_number = o.trackingNumber || null;
  if (o.labelUrl        !== undefined) patch.label_url       = o.labelUrl || null;
  if (o.shipDate        !== undefined) patch.ship_date       = o.shipDate || null;
  if (o.notes           !== undefined) patch.notes           = o.notes;
  const { error } = await supabase.from("logistics_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteLogisticsOrder(id: number): Promise<void> {
  const { error } = await supabase.from("logistics_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function uploadLogisticsLabel(file: File): Promise<string> {
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { data, error } = await supabase.storage.from("logistics-labels").upload(path, file);
  if (error) throw new Error(error.message);
  return data.path;
}

export async function getLogisticsLabelUrl(pathOrUrl: string): Promise<string> {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  const { data, error } = await supabase.storage
    .from("logistics-labels")
    .createSignedUrl(pathOrUrl, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ── Sample Catalog ─────────────────────────────────────────────────────────────

export async function getSampleCatalog(): Promise<SampleCatalogItem[]> {
  const { data, error } = await supabase
    .from("strategy_sample_catalog")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    id: r.id, productName: r.product_name, productId: r.product_id ?? "",
    monthlyQuota: r.monthly_quota, active: r.active, sortOrder: r.sort_order,
  }));
}

// ── Strategy Samples ───────────────────────────────────────────────────────────

export async function getStrategySamples(): Promise<StrategySample[]> {
  const PAGE = 1000;
  let from = 0;
  let all: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("strategy_samples")
      .select("*")
      .order("sent_date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data ?? []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all.map(mapStrategySample);
}

export async function createStrategySample(s: Omit<StrategySample, "id">): Promise<StrategySample> {
  const { data, error } = await supabase
    .from("strategy_samples")
    .insert({
      agent_id: s.agentId,
      username: s.username,
      sku: s.sku,
      sent_date: s.sentDate,
      videos_published: s.videosPublished,
      year: s.year,
      month: s.month,
      notes: s.notes,
      delivery_status: s.deliveryStatus ?? "delivered",
      responded: s.responded ?? false,
      bonus_cycle_key: s.bonusCycleKey ?? null,
      catalog_id: s.catalogId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapStrategySample(data);
}

export async function bulkCreateStrategySamples(rows: Omit<StrategySample, "id">[]): Promise<number> {
  const payload = rows.map(s => ({
    agent_id: s.agentId,
    username: s.username,
    sku: s.sku,
    sent_date: s.sentDate,
    videos_published: s.videosPublished,
    year: s.year,
    month: s.month,
    notes: s.notes,
    delivery_status: s.deliveryStatus ?? "delivered",
    responded: s.responded ?? false,
    bonus_cycle_key: s.bonusCycleKey ?? null,
    catalog_id: s.catalogId ?? null,
  }));
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from("strategy_samples").insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }
  return inserted;
}

export async function updateStrategySample(id: number, fields: Partial<Pick<StrategySample, "videosPublished" | "notes" | "username" | "sku" | "sentDate" | "deliveryStatus" | "responded" | "bonusCycleKey" | "catalogId">>): Promise<void> {
  const patch: any = {};
  if (fields.videosPublished != null) patch.videos_published = fields.videosPublished;
  if (fields.notes != null) patch.notes = fields.notes;
  if (fields.username != null) patch.username = fields.username;
  if (fields.sku != null) patch.sku = fields.sku;
  if (fields.sentDate != null) patch.sent_date = fields.sentDate;
  if (fields.deliveryStatus != null) patch.delivery_status = fields.deliveryStatus;
  if (fields.responded != null) patch.responded = fields.responded;
  if (fields.bonusCycleKey !== undefined) patch.bonus_cycle_key = fields.bonusCycleKey;
  if (fields.catalogId !== undefined) patch.catalog_id = fields.catalogId ?? null;
  const { error } = await supabase.from("strategy_samples").update(patch).eq("id", id);
  if (error) throw error;
}

export async function addVideoLogEntry(id: number, date: string): Promise<string[]> {
  const { data: cur, error: fetchErr } = await supabase
    .from("strategy_samples").select("video_log").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const log: string[] = Array.isArray(cur?.video_log) ? cur.video_log : [];
  const newLog = [...log, date];
  const { error } = await supabase
    .from("strategy_samples")
    .update({ video_log: newLog, videos_published: newLog.length })
    .eq("id", id);
  if (error) throw error;
  return newLog;
}

export async function addVideoLogEntriesBulk(id: number, date: string, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const { data: cur, error: fetchErr } = await supabase
    .from("strategy_samples").select("video_log").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const log: string[] = Array.isArray(cur?.video_log) ? cur.video_log : [];
  const newLog = [...log, ...Array(count).fill(date)];
  const { error } = await supabase
    .from("strategy_samples")
    .update({ video_log: newLog, videos_published: newLog.length })
    .eq("id", id);
  if (error) throw error;
  return newLog;
}

export async function replaceVideoLogForPeriod(id: number, periodStart: string, periodEnd: string, count: number, dateForNew: string): Promise<string[]> {
  const { data: cur, error: fetchErr } = await supabase
    .from("strategy_samples").select("video_log").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const log: string[] = Array.isArray(cur?.video_log) ? cur.video_log : [];
  const kept = log.filter(d => d < periodStart || d > periodEnd);
  const newLog = [...kept, ...Array(Math.max(0,count)).fill(dateForNew)];
  const { error } = await supabase
    .from("strategy_samples")
    .update({ video_log: newLog, videos_published: newLog.length })
    .eq("id", id);
  if (error) throw error;
  return newLog;
}

export async function removeLastVideoLogEntry(id: number): Promise<string[]> {
  const { data: cur, error: fetchErr } = await supabase
    .from("strategy_samples").select("video_log").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const log: string[] = Array.isArray(cur?.video_log) ? cur.video_log : [];
  const newLog = log.slice(0, -1);
  const { error } = await supabase
    .from("strategy_samples")
    .update({ video_log: newLog, videos_published: newLog.length })
    .eq("id", id);
  if (error) throw error;
  return newLog;
}

export async function deleteStrategySample(id: number): Promise<void> {
  const { error } = await supabase.from("strategy_samples").delete().eq("id", id);
  if (error) throw error;
}

// ── Agency uploads (influencer approval workflow) ──────────────────────────────

export async function getUploadBatches(): Promise<UploadBatch[]> {
  const { data, error } = await supabase
    .from("strategy_uploads")
    .select("*")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, filename: r.filename, uploadedAt: r.uploaded_at,
    columns: r.columns ?? [], nameColumn: r.name_column,
  }));
}

export async function getUploadRows(): Promise<UploadRow[]> {
  const { data, error } = await supabase
    .from("strategy_upload_rows")
    .select("*")
    .order("id", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, uploadId: r.upload_id, data: r.data ?? {}, displayName: r.display_name,
    decision: r.decision, decidedAt: r.decided_at ?? undefined, sampleId: r.sample_id ?? undefined,
  }));
}

export async function createUploadBatch(
  filename: string, columns: string[], nameColumn: string,
  rows: { data: Record<string, string>; displayName: string }[],
): Promise<UploadBatch> {
  const { data: batch, error: batchErr } = await supabase
    .from("strategy_uploads")
    .insert({ filename, columns, name_column: nameColumn })
    .select()
    .single();
  if (batchErr) throw batchErr;

  const { error: rowsErr } = await supabase
    .from("strategy_upload_rows")
    .insert(rows.map(r => ({ upload_id: batch.id, data: r.data, display_name: r.displayName })));
  if (rowsErr) throw rowsErr;

  return { id: batch.id, filename: batch.filename, uploadedAt: batch.uploaded_at, columns: batch.columns ?? [], nameColumn: batch.name_column };
}

export async function deleteUploadBatch(batchId: number): Promise<void> {
  const { error } = await supabase.from("strategy_uploads").delete().eq("id", batchId);
  if (error) throw error;
}

export async function decideUploadRow(rowId: number, decision: "accepted" | "rejected", sampleId?: number): Promise<void> {
  const { error } = await supabase
    .from("strategy_upload_rows")
    .update({ decision, decided_at: new Date().toISOString(), sample_id: sampleId ?? null })
    .eq("id", rowId);
  if (error) throw error;
}

export async function reinstateUploadRow(rowId: number): Promise<void> {
  const { error } = await supabase
    .from("strategy_upload_rows")
    .update({ decision: "pending", decided_at: null, sample_id: null })
    .eq("id", rowId);
  if (error) throw error;
}

export async function deleteUploadRows(rowIds: number[]): Promise<void> {
  if (rowIds.length === 0) return;
  const { error } = await supabase.from("strategy_upload_rows").delete().in("id", rowIds);
  if (error) throw error;
}

export async function decideUploadRowsBulk(rowIds: number[], decision: "accepted" | "rejected"): Promise<void> {
  if (rowIds.length === 0) return;
  const { error } = await supabase
    .from("strategy_upload_rows")
    .update({ decision, decided_at: new Date().toISOString() })
    .in("id", rowIds);
  if (error) throw error;
}

// ── Sample product analysis (TikTok "Sample Analysis Product List" exports) ───

function mapSampleAnalysisPeriod(r: any): SampleAnalysisPeriod {
  return { id: r.id, filename: r.filename, periodStart: r.period_start, periodEnd: r.period_end, uploadedAt: r.uploaded_at };
}

function mapSampleAnalysisRow(r: any): SampleAnalysisRow {
  return {
    id: r.id, periodId: r.period_id,
    productName: r.product_name ?? "", productId: r.product_id ?? "", productCategory: r.product_category ?? "",
    contentGmv: r.content_gmv, refunds: r.refunds,
    samplesRequested: r.samples_requested, samplesShipped: r.samples_shipped,
    status: r.status ?? "", videosWithSamples: r.videos_with_samples, liveStreamsWithSamples: r.live_streams_with_samples,
    roi45d: r.roi_45d, roi90d: r.roi_90d, creatorsMetRefundCriteria: r.creators_met_refund_criteria,
    targetRoi: r.target_roi, refundedOrders: r.refunded_orders, estRefundableGmv: r.est_refundable_gmv,
    ordersNeededForRefund: r.orders_needed_for_refund, catalogId: r.catalog_id ?? null,
  };
}

export async function getSampleAnalysisPeriods(): Promise<SampleAnalysisPeriod[]> {
  const { data, error } = await supabase.from("sample_analysis_periods").select("*").order("period_start", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapSampleAnalysisPeriod);
}

export async function getSampleAnalysisRows(): Promise<SampleAnalysisRow[]> {
  const { data, error } = await supabase.from("sample_analysis_rows").select("*");
  if (error) throw error;
  return (data ?? []).map(mapSampleAnalysisRow);
}

export async function createSampleAnalysisPeriod(
  filename: string, periodStart: string, periodEnd: string,
  rows: Omit<SampleAnalysisRow, "id" | "periodId">[],
): Promise<SampleAnalysisPeriod> {
  const { data: period, error: periodErr } = await supabase
    .from("sample_analysis_periods")
    .insert({ filename, period_start: periodStart, period_end: periodEnd })
    .select().single();
  if (periodErr) throw periodErr;

  const { error: rowsErr } = await supabase.from("sample_analysis_rows").insert(rows.map(r => ({
    period_id: period.id,
    product_name: r.productName, product_id: r.productId, product_category: r.productCategory,
    content_gmv: r.contentGmv, refunds: r.refunds,
    samples_requested: r.samplesRequested, samples_shipped: r.samplesShipped,
    status: r.status, videos_with_samples: r.videosWithSamples, live_streams_with_samples: r.liveStreamsWithSamples,
    roi_45d: r.roi45d, roi_90d: r.roi90d, creators_met_refund_criteria: r.creatorsMetRefundCriteria,
    target_roi: r.targetRoi, refunded_orders: r.refundedOrders, est_refundable_gmv: r.estRefundableGmv,
    orders_needed_for_refund: r.ordersNeededForRefund, catalog_id: r.catalogId,
  })));
  if (rowsErr) throw rowsErr;

  return mapSampleAnalysisPeriod(period);
}

export async function deleteSampleAnalysisPeriod(id: number): Promise<void> {
  const { error } = await supabase.from("sample_analysis_periods").delete().eq("id", id);
  if (error) throw error;
}

export async function setSampleAnalysisRowCatalog(rowId: number, catalogId: number | null): Promise<void> {
  const { error } = await supabase.from("sample_analysis_rows").update({ catalog_id: catalogId }).eq("id", rowId);
  if (error) throw error;
}

// ── Affiliate contest ("Concurso de Afiliados") ────────────────────────────────

function mapContestEntry(r: any): AffiliateContestEntry {
  return {
    id: r.id,
    username: r.username ?? "",
    videosTotal: r.videos_total ?? 0,
    lastSeenSnapshot: r.last_seen_snapshot ?? 0,
    qualified: r.qualified ?? false,
    updatedAt: r.updated_at ?? "",
  };
}

export async function getAffiliateContestEntries(): Promise<AffiliateContestEntry[]> {
  const { data, error } = await supabase
    .from("affiliate_contest_entries")
    .select("*")
    .order("videos_total", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapContestEntry);
}

export async function upsertAffiliateContestSnapshot(
  rows: { username: string; videos: number }[]
): Promise<{ added: number; updated: number }> {
  const { data: existing, error: fetchErr } = await supabase.from("affiliate_contest_entries").select("*");
  if (fetchErr) throw fetchErr;
  const byUsername = new Map((existing ?? []).map((r: any) => [String(r.username).trim().toLowerCase(), r]));
  let added = 0, updated = 0;
  for (const row of rows) {
    const key = row.username.trim().toLowerCase();
    if (!key) continue;
    const found = byUsername.get(key);
    if (found) {
      const delta = Math.max(0, row.videos - (found.last_seen_snapshot ?? 0));
      const { error } = await supabase
        .from("affiliate_contest_entries")
        .update({
          videos_total: (found.videos_total ?? 0) + delta,
          last_seen_snapshot: row.videos,
          updated_at: new Date().toISOString(),
        })
        .eq("id", found.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await supabase
        .from("affiliate_contest_entries")
        .insert({ username: row.username.trim(), videos_total: row.videos, last_seen_snapshot: row.videos, qualified: false });
      if (error) throw error;
      added++;
    }
  }
  return { added, updated };
}

export async function setAffiliateContestQualified(id: number, qualified: boolean): Promise<void> {
  const { error } = await supabase.from("affiliate_contest_entries").update({ qualified }).eq("id", id);
  if (error) throw error;
}

export async function deleteAffiliateContestEntry(id: number): Promise<void> {
  const { error } = await supabase.from("affiliate_contest_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAffiliateContestEntries(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("affiliate_contest_entries").delete().in("id", ids);
  if (error) throw error;
}

export async function lockSampleBonus(agentId: number, year: string, cycleId: string, amount: number): Promise<void> {
  const { error } = await supabase
    .from("strategy_entries")
    .update({
      bonus_samples_locked: true,
      bonus_samples_locked_at: new Date().toISOString(),
      bonus_samples_locked_amount: amount,
    })
    .eq("agent_id", agentId).eq("year", year).eq("cycle_id", cycleId);
  if (error) throw error;
}

export async function unlockSampleBonus(agentId: number, year: string, cycleId: string): Promise<void> {
  const { error } = await supabase
    .from("strategy_entries")
    .update({
      bonus_samples_locked: false,
      bonus_samples_locked_at: null,
      bonus_samples_locked_amount: null,
    })
    .eq("agent_id", agentId).eq("year", year).eq("cycle_id", cycleId);
  if (error) throw error;
}

// ── Strategy Incidents ─────────────────────────────────────────────────────────

export async function getStrategyIncidents(agentId: number, year: string, cycleId: string, metricType: 'non_buyer' | 'neg_review'): Promise<StrategyIncident[]> {
  const { data, error } = await supabase
    .from("strategy_incidents")
    .select("*")
    .eq("agent_id", agentId)
    .eq("year", year)
    .eq("cycle_id", cycleId)
    .eq("metric_type", metricType)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapStrategyIncident);
}

export async function createStrategyIncident(i: Omit<StrategyIncident, "id" | "createdAt">): Promise<StrategyIncident> {
  const { data, error } = await supabase
    .from("strategy_incidents")
    .insert({
      agent_id: i.agentId, year: i.year, cycle_id: i.cycleId,
      metric_type: i.metricType, order_number: i.orderNumber ?? null,
      username: i.username ?? null, note: i.note, status: i.status,
    })
    .select().single();
  if (error) throw new Error(error.message);
  return mapStrategyIncident(data);
}

export async function updateStrategyIncident(id: number, fields: Partial<Pick<StrategyIncident, "orderNumber" | "username" | "note" | "status">>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.orderNumber !== undefined) patch.order_number = fields.orderNumber;
  if (fields.username    !== undefined) patch.username     = fields.username;
  if (fields.note        !== undefined) patch.note         = fields.note;
  if (fields.status      !== undefined) patch.status       = fields.status;
  const { error } = await supabase.from("strategy_incidents").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteStrategyIncident(id: number): Promise<void> {
  const { error } = await supabase.from("strategy_incidents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

function mapStrategyIncident(r: any): StrategyIncident {
  return {
    id: r.id, agentId: r.agent_id, year: r.year, cycleId: r.cycle_id,
    metricType: r.metric_type, orderNumber: r.order_number ?? undefined,
    username: r.username ?? undefined, note: r.note ?? "",
    status: r.status ?? "pending", createdAt: r.created_at ?? "",
  };
}

function mapStrategySample(r: any): StrategySample {
  return {
    id: r.id,
    agentId: r.agent_id,
    username: r.username ?? "",
    sku: r.sku ?? "",
    sentDate: r.sent_date ?? "",
    videosPublished: r.videos_published ?? 0,
    year: r.year ?? "",
    month: r.month ?? 0,
    notes: r.notes ?? "",
    deliveryStatus: r.delivery_status ?? "delivered",
    responded: r.responded ?? false,
    bonusCycleKey: r.bonus_cycle_key ?? undefined,
    catalogId: r.catalog_id ?? undefined,
    videoLog: Array.isArray(r.video_log) ? r.video_log : [],
  };
}

// ── Marketing module ────────────────────────────────────────────────────────

function mapMarketingBrief(r: any): MarketingBrief {
  return {
    id: r.id,
    reference: r.reference,
    productLine: r.product_line ?? "",
    startDate: r.start_date,
    estimatedStartDate: r.estimated_start_date ?? null,
    currentStage: r.current_stage,
    status: r.status,
    stages: Array.isArray(r.stages) ? r.stages : [],
    shiftDays: r.shift_days ?? 0,
    lauraDelayDays: r.laura_delay_days ?? 0,
    designDelayCount: r.design_delay_count ?? 0,
    extraRevisionRounds: r.extra_revision_rounds ?? 0,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    assignedDisenoEmail: r.assigned_diseno_email ?? null,
    carolNotifiedAt: r.carol_notified_at ?? null,
  };
}

function mapMarketingNotification(r: any): MarketingNotification {
  return {
    id: r.id, briefId: r.brief_id, message: r.message, createdAt: r.created_at,
    readLaura: r.read_laura ?? false, readDiseno: r.read_diseno ?? false, readCarol: r.read_carol ?? false,
  };
}

export async function getMarketingBriefs(): Promise<MarketingBrief[]> {
  const { data, error } = await supabase.from("marketing_briefs").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapMarketingBrief);
}

export async function createMarketingBrief(b: Omit<MarketingBrief, "id" | "createdAt" | "updatedAt">): Promise<MarketingBrief> {
  const { data, error } = await supabase.from("marketing_briefs").insert({
    reference: b.reference, product_line: b.productLine, start_date: b.startDate,
    estimated_start_date: b.estimatedStartDate, current_stage: b.currentStage,
    status: b.status, stages: b.stages, shift_days: b.shiftDays,
    laura_delay_days: b.lauraDelayDays, design_delay_count: b.designDelayCount,
    extra_revision_rounds: b.extraRevisionRounds, completed_at: b.completedAt,
    assigned_diseno_email: b.assignedDisenoEmail, carol_notified_at: b.carolNotifiedAt,
  }).select().single();
  if (error) throw error;
  return mapMarketingBrief(data);
}

export async function updateMarketingBrief(id: number, patch: Partial<Omit<MarketingBrief, "id"|"createdAt"|"updatedAt">>): Promise<void> {
  const dbPatch: any = { updated_at: new Date().toISOString() };
  if (patch.currentStage !== undefined) dbPatch.current_stage = patch.currentStage;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.stages !== undefined) dbPatch.stages = patch.stages;
  if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate;
  if (patch.estimatedStartDate !== undefined) dbPatch.estimated_start_date = patch.estimatedStartDate;
  if (patch.shiftDays !== undefined) dbPatch.shift_days = patch.shiftDays;
  if (patch.lauraDelayDays !== undefined) dbPatch.laura_delay_days = patch.lauraDelayDays;
  if (patch.designDelayCount !== undefined) dbPatch.design_delay_count = patch.designDelayCount;
  if (patch.extraRevisionRounds !== undefined) dbPatch.extra_revision_rounds = patch.extraRevisionRounds;
  if (patch.completedAt !== undefined) dbPatch.completed_at = patch.completedAt;
  if (patch.assignedDisenoEmail !== undefined) dbPatch.assigned_diseno_email = patch.assignedDisenoEmail;
  if (patch.carolNotifiedAt !== undefined) dbPatch.carol_notified_at = patch.carolNotifiedAt;
  const { error } = await supabase.from("marketing_briefs").update(dbPatch).eq("id", id);
  if (error) throw error;
}

export async function sendMarketingEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    await fetch("/.netlify/functions/send-marketing-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html }),
    });
  } catch {
    // Email notifications are best-effort — never block the workflow action on a send failure.
  }
}

export async function deleteMarketingBrief(id: number): Promise<void> {
  const { error } = await supabase.from("marketing_briefs").delete().eq("id", id);
  if (error) throw error;
}

export async function getMarketingNotifications(): Promise<MarketingNotification[]> {
  const { data, error } = await supabase.from("marketing_notifications").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map(mapMarketingNotification);
}

export async function createMarketingNotification(briefId: number | null, message: string): Promise<void> {
  const { error } = await supabase.from("marketing_notifications").insert({ brief_id: briefId, message });
  if (error) throw error;
}

export async function markMarketingNotificationsRead(role: "laura"|"diseno"|"carol", ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const field = role === "laura" ? "read_laura" : role === "carol" ? "read_carol" : "read_diseno";
  const { error } = await supabase.from("marketing_notifications").update({ [field]: true }).in("id", ids);
  if (error) throw error;
}

export async function deleteMarketingNotification(id: number): Promise<void> {
  const { error } = await supabase.from("marketing_notifications").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllMarketingNotifications(): Promise<void> {
  const { error } = await supabase.from("marketing_notifications").delete().gte("id", 0);
  if (error) throw error;
}

export type MarketingNotifySlot = "laura" | "carol" | "diseno_1" | "diseno_2" | "diseno_3";

export interface MarketingNotifyEmails {
  laura: string;
  carol: string;
  diseno_1: string;
  diseno_2: string;
  diseno_3: string;
}

const NOTIFY_SLOTS: MarketingNotifySlot[] = ["laura", "carol", "diseno_1", "diseno_2", "diseno_3"];

// Display names come from each person's Hub Access nickname (see getHubNicknames) — this table
// only maps a Marketing slot to an email address, so a name never has to be typed twice.
export async function getMarketingNotifyEmails(): Promise<MarketingNotifyEmails> {
  const { data, error } = await supabase.from("marketing_notify_emails").select("*");
  if (error) throw error;
  const emails: MarketingNotifyEmails = { laura: "", carol: "", diseno_1: "", diseno_2: "", diseno_3: "" };
  (data ?? []).forEach((r: any) => {
    if (NOTIFY_SLOTS.includes(r.role)) emails[r.role as MarketingNotifySlot] = r.email ?? "";
  });
  return emails;
}

export async function setMarketingNotifyEmail(role: MarketingNotifySlot, email: string): Promise<void> {
  const { error } = await supabase.from("marketing_notify_emails").upsert({ role, email });
  if (error) throw error;
}

// ── Hub access control (Microsoft login → who sees which team) ────────────────

export interface HubAccessEntry {
  email: string;
  teams: string[];
  isAdmin: boolean;
  nickname: string;
}

export async function getHubAccessForEmail(email: string): Promise<HubAccessEntry | null> {
  const { data, error } = await supabase.from("hub_access").select("*").ilike("email", email).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { email: data.email, teams: data.teams ?? [], isAdmin: data.is_admin ?? false, nickname: data.nickname ?? "" };
}

export async function getAllHubAccess(): Promise<HubAccessEntry[]> {
  const { data, error } = await supabase.from("hub_access").select("*").order("email");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ email: r.email, teams: r.teams ?? [], isAdmin: r.is_admin ?? false, nickname: r.nickname ?? "" }));
}

export async function upsertHubAccess(email: string, teams: string[], isAdmin: boolean, nickname: string): Promise<void> {
  const { error } = await supabase.from("hub_access").upsert({ email: email.toLowerCase().trim(), teams, is_admin: isAdmin, nickname });
  if (error) throw error;
}

export interface MarketingAccessPerson { email: string; nickname: string; role: "admin" | "staff" | "carol" }

// Everyone who already has a Marketing role in Hub Access — lets the Marketing settings panel
// offer a picker instead of asking an admin to retype emails that are already configured there.
export async function getMarketingAccessDirectory(): Promise<MarketingAccessPerson[]> {
  const { data, error } = await supabase.from("hub_access").select("email,nickname,teams,is_admin");
  if (error) throw error;
  const out: MarketingAccessPerson[] = [];
  (data ?? []).forEach((r: any) => {
    // The Hub's main admin (full "ALL" access) can fill any Marketing slot, not just the ones
    // explicitly tagged "MARKETING:..." — they outrank per-team role tags entirely.
    if (r.is_admin || (r.teams ?? []).includes("ALL")) {
      (["admin", "staff", "carol"] as const).forEach(role => {
        out.push({ email: r.email, nickname: r.nickname ?? "", role });
      });
      return;
    }
    const entry = (r.teams ?? []).find((t: string) => t.startsWith("MARKETING:"));
    if (!entry) return;
    const role = entry.split(":")[1];
    if (role === "admin" || role === "staff" || role === "carol") {
      out.push({ email: r.email, nickname: r.nickname ?? "", role });
    }
  });
  return out;
}

// Looks up display nicknames for a set of emails — used by modules (like Marketing) that want to
// show "who" instead of a generic role, without keeping a second copy of everyone's name.
export async function getHubNicknames(emails: string[]): Promise<Record<string, string>> {
  const clean = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)));
  if (clean.length === 0) return {};
  const { data, error } = await supabase.from("hub_access").select("email,nickname").in("email", clean);
  if (error) throw error;
  const map: Record<string, string> = {};
  (data ?? []).forEach((r: any) => { if (r.nickname) map[r.email.toLowerCase()] = r.nickname; });
  return map;
}

export async function deleteHubAccess(email: string): Promise<void> {
  const { error } = await supabase.from("hub_access").delete().eq("email", email);
  if (error) throw error;
}

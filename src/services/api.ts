import { supabase } from "./supabase";
import type {
  Agent, Appeal, UsaPeriodData, TikTokScore, UsaLiveSchedule,
  MexAttendance, MexAgentGoal, MexAttendanceDay, MexLiveSale, MexMonthlyGoal, MexScheduleEvent,
  OpsAppeal, OpsHandlingTime, OpsTikTokScore,
  AptClaim,
  AptA2zClaim, AptSafetyClaim, AptFeedback,
  AptAccountHealth, AptTikTokHealth, AptPerformance,
} from "../types";

const USA_PASSWORD = "usa2026";
const MEX_PASSWORD = "mex2026";
const MEX_STAFF_PASSWORD = "FAJA";
const OPS_PASSWORD = "ops2026";
const APT_PASSWORD = "apt2026";
const TKLIVES_PASSWORD = "usa2026";

// ── Auth ─────────────────────────────────────────────────────────────────────

// Returns "admin" | "staff" for MEX, "admin" for others
export async function verifyPassword(team: string, password: string): Promise<"admin" | "staff"> {
  if (team.toUpperCase() === "MEX") {
    if (password === MEX_PASSWORD) return "admin";
    if (password === MEX_STAFF_PASSWORD) return "staff";
    throw new Error("Incorrect password.");
  }
  const map: Record<string, string> = {
    USA: USA_PASSWORD, OPS: OPS_PASSWORD, APT: APT_PASSWORD, TKLIVES: TKLIVES_PASSWORD,
  };
  const expected = map[team.toUpperCase()];
  if (!expected || password !== expected) throw new Error("Incorrect password.");
  return "admin";
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
    .insert({ agent_id: a.agentId, date: a.date, order_number: a.orderNumber, status: a.status, outcome: a.outcome, year: a.year, cycle_id: a.cycleId })
    .select().single();
  if (error) throw error;
  return mapOpsAppeal(data);
}

export async function updateOpsAppeal(id: number, a: Partial<OpsAppeal>): Promise<OpsAppeal> {
  const { data, error } = await supabase.from("ops_appeals")
    .update({ agent_id: a.agentId, date: a.date, order_number: a.orderNumber, status: a.status, outcome: a.outcome })
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
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, orderNumber: r.order_number, status: r.status, outcome: r.outcome, year: r.year, cycleId: r.cycle_id };
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

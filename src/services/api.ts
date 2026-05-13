import { supabase } from "./supabase";
import type {
  Agent, Appeal, UsaPeriodData, TikTokScore,
  MexAttendance, MexLiveSale, MexMonthlyGoal,
} from "../types";

const USA_PASSWORD = "usa2026";
const MEX_PASSWORD = "mex2026";

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function verifyPassword(team: string, password: string): Promise<void> {
  const expected = team.toUpperCase() === "USA" ? USA_PASSWORD : MEX_PASSWORD;
  if (password !== expected) throw new Error("Incorrect password.");
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
    .insert({ agent_id: sale.agentId, date: sale.date, sales_amount: sale.salesAmount, year: sale.year, month: sale.month })
    .select()
    .single();
  if (error) throw error;
  return mapMexSale(data);
}

export async function deleteMexSale(id: number): Promise<void> {
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
  return { id: r.id, agentId: r.agent_id, agent: r.agent ?? undefined, date: r.date, salesAmount: r.sales_amount, year: r.year, month: r.month };
}

function mapMexGoal(r: any): MexMonthlyGoal {
  return { id: r.id, year: r.year, month: r.month, goalAmount: r.goal_amount, actualAmount: r.actual_amount };
}

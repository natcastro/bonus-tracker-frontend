export interface Agent {
  id: number;
  name: string;
  team: string;
}

// USA types
export interface Appeal {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  orderNumber: string;
  platform: "Amazon" | "TikTok";
  status: "inProgress" | "completed";
  outcome: "fullRefund" | "partialRefund" | "fee" | "lost";
  year: number;
  cycleId: string;
}

export interface UsaPeriodData {
  id: number;
  agentId: number;
  agent?: Agent;
  year: number;
  cycleId: string;
  amazonHealth: "good" | "minor" | "bad";
  csQuality: "0" | "1" | "2";
}

export interface TikTokScore {
  id: number;
  date: string;
  score: number;
  duration: number;
  year: number;
  cycleId: string;
}

export interface Cycle {
  id: string;
  name: string;
  days: number;
}

// Mexico types
export interface MexAttendance {
  id: number;
  agentId: number;
  agent?: Agent;
  year: number;
  month: number;
  status: "none" | "justified" | "multiple";
}

export interface MexLiveSale {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  salesAmount: number;
  quantity: number;
  skus: string;
  year: number;
  month: number;
}

export interface MexAttendanceDay {
  id: number;
  agentId: number;
  date: string;
  status: "present" | "late" | "absent" | "justified";
  note: string;
  year: number;
  month: number;
}

export interface MexScheduleEvent {
  id: number;
  agentId: number;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
  year: number;
  month: number;
}

export interface MexMonthlyGoal {
  id: number;
  year: number;
  month: number;
  goalAmount: number;
  actualAmount: number;
}

export interface MexAgentGoal {
  id: number;
  agentId: number;
  year: number;
  month: number;
  goalAmount: number;
}

// ── Operations Team (Tomás) ────────────────────────────────────────────────────

export interface OpsAppeal {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  orderNumber: string;
  status: "pending" | "inProgress" | "completed";
  outcome: "fullRefund" | "partialRefund" | "fee" | "lost";
  year: number;
  cycleId: string;
}

export interface OpsHandlingTime {
  id: number;
  agentId: number;
  year: number;
  cycleId: string;
  hours: number;
}

export interface OpsTikTokScore {
  id: number;
  date: string;
  score: number;
  duration: number;
  year: number;
  cycleId: string;
}

// ── Account Protection Team (Juan) ────────────────────────────────────────────

export interface AptClaim {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  referenceNumber: string;
  claimType: "a2z" | "safety" | "feedback" | "account_health" | "tiktok_health";
  subType: string;
  status: "pending" | "completed";
  year: number;
  cycleId: string;
}

export interface AptA2zClaim {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  year: number;
  cycleId: string;
}

export interface AptSafetyClaim {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  outcome: "fullRecovery" | "partialRecovery" | "fees" | "lost";
  year: number;
  cycleId: string;
}

export interface AptFeedback {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  platform: "Amazon" | "TikTok";
  year: number;
  cycleId: string;
}

export interface AptAccountHealth {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  type: "penalty" | "violation" | "health_appeal";
  year: number;
  cycleId: string;
}

export interface AptTikTokHealth {
  id: number;
  agentId: number;
  agent?: Agent;
  date: string;
  type: "non_buyer_fault" | "defective_item";
  year: number;
  cycleId: string;
}

export interface AptPerformance {
  id: number;
  agentId: number;
  year: number;
  cycleId: string;
  level: "deficient" | "minimum" | "acceptable" | "good" | "very_good" | "excellent";
}

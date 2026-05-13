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

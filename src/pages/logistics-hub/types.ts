export type Platform = "tiktok" | "amazon" | "shopify";

export type HubLocation = "Belier" | "Norte" | "Plaza" | "Colombia";

export type WorkflowStatus =
  | "unassigned"
  | "pending_logistics"
  | "pending_store"
  | "completed"
  | "attention";

export type DocStatus = "none" | "generating" | "ready" | "missing" | "failed";

export interface ActivityEntry {
  time: string; // ISO
  text: string;
}

export interface HubOrder {
  id: string; // e.g. "TT-45829"
  platform: Platform;
  createdAt: string; // ISO
  customer?: string;
  product: string;
  sku: string;
  qty: number;
  variant?: string;

  status: WorkflowStatus;
  location?: HubLocation;
  shopifyNumber?: string; // "#2304"

  invoiceStatus: DocStatus;
  labelStatus: DocStatus;
  labelUrl?: string;

  assignedBy?: string;
  assignedAt?: string;
  labelViewedAt?: string;
  invoiceViewedAt?: string;
  completedAt?: string;
  completedBy?: string;

  attentionReason?: string;
  failedSteps?: string[];

  activity: ActivityEntry[];
}

// Colombia has no dedicated store user — Logística also handles Colombia's store-side.
export type StoreRole = "Belier" | "Norte" | "Plaza";
export type HubRole = "admin" | "logistics" | StoreRole;

export interface HubUser {
  id: string;
  name: string;
  email: string;
  role: HubRole;
}
